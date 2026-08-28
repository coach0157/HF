/**
 * e2e coverage for Epic 8 — Chat (spec 2.3 / docs/PHASE2_BACKLOG.md Epic 8,
 * ADR-004/005 in docs/ARCHITECTURE.md §8.1-8.2).
 *
 * Two parts:
 *  1. REST endpoints (`/chat-rooms*`) — same API-driven e2e pattern as
 *     test/maintenance.e2e-spec.ts / test/transport-provider.e2e-spec.ts:
 *     RBAC, cross-tenant isolation (RLS), room-membership authorization.
 *  2. A REAL Socket.io client (`socket.io-client`) driving `ChatGateway`
 *     against the live NestApplication started by `app.listen(0)` — this is
 *     the "WebSocket e2e test ทำเท่าที่ทำได้" the backlog asks for: full
 *     handshake auth (valid/invalid/missing token), room-level join
 *     authorization, real-time message delivery between two connected
 *     clients, residentsCanPost enforcement over the wire, and rate
 *     limiting — all against the actual gateway code, not a mock.
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { CanActivate } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import { io, Socket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import {
  rawPrisma,
  withVillageContext,
  createVillageFixture,
  deleteVillage,
  api,
  loginToken,
  nextPhone,
  VillageFixture,
} from "./support/test-helpers";

describe("Chat (Epic 8) — API + WebSocket e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let villageA: VillageFixture;
  let villageB: VillageFixture;
  let residentB2Id: string;
  let residentB2Phone: string;

  beforeAll(async () => {
    (ThrottlerGuard.prototype as unknown as CanActivate).canActivate =
      async () => true;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    villageA = await createVillageFixture("CHT-A", "91");
    villageB = await createVillageFixture("CHT-B", "92");

    // A second resident in village A, needed to test "an outsider to a
    // DIRECT room cannot join/read it even though they're in the same
    // village" (RLS alone would allow this — only the explicit
    // ChatParticipant check in ChatService stops it, ADR-005 point 4).
    residentB2Phone = nextPhone("91");
    await withVillageContext(villageA.villageId, async (tx) => {
      const house2 = await tx.house.create({
        data: {
          villageId: villageA.villageId,
          houseNo: "CHT-A-2",
          zone: "QA-ZONE",
        },
      });
      const resident2 = await tx.user.create({
        data: {
          villageId: villageA.villageId,
          name: "Resident CHT-A-2",
          phone: residentB2Phone,
          role: "RESIDENT",
          houseId: house2.id,
        },
      });
      residentB2Id = resident2.id;
    });
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  // ---------------------------------------------------------------------
  // GET /users staff-directory restriction (Epic 8 dependency — a resident
  // needs SOME way to find an admin/guard to start a DIRECT chat with,
  // without reopening the resident directory spec 2.7 explicitly rejected).
  // ---------------------------------------------------------------------

  describe("GET /users — resident/guard staff-directory only, never a resident directory", () => {
    it("a resident sees admin/guard rows but never another resident", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/users", { token: residentToken });
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(
        res.body.every((u: any) => u.role === "ADMIN" || u.role === "GUARD"),
      ).toBe(true);
      expect(res.body.some((u: any) => u.id === residentB2Id)).toBe(false);
    });

    it("a resident's ?role=RESIDENT filter is ignored server-side (still staff-only)", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/users?role=RESIDENT", {
        token: residentToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.every((u: any) => u.role !== "RESIDENT")).toBe(true);
    });

    it("a guard is also restricted to the staff-only view", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/users", { token: guardToken });
      expect(res.status).toBe(200);
      expect(
        res.body.every((u: any) => u.role === "ADMIN" || u.role === "GUARD"),
      ).toBe(true);
    });

    it("an admin still gets the full unrestricted list", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/users?role=RESIDENT", {
        token: adminToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.some((u: any) => u.id === villageA.resident.id)).toBe(
        true,
      );
    });
  });

  // ---------------------------------------------------------------------
  // REST: POST /chat-rooms, GET /chat-rooms, GET /chat-rooms/:id/messages,
  // PATCH /chat-rooms/:id, PATCH /chat-rooms/:id/read
  // ---------------------------------------------------------------------

  describe("POST /chat-rooms — DIRECT find-or-create + role-pair validation", () => {
    it("resident<->admin: creates a DIRECT room; a second call returns the same room", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      void adminToken;

      const first = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });
      expect(first.status).toBe(201);
      expect(first.body.type).toBe("DIRECT");

      const second = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
    });

    it("resident<->guard: creates a DIRECT room", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.guardOnDuty.id },
      });
      expect(res.status).toBe(201);
      expect(res.body.type).toBe("DIRECT");
    });

    it("resident<->resident is rejected with 400", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: residentB2Id },
      });
      expect(res.status).toBe(400);
    });

    it("admin<->guard is rejected with 400", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/chat-rooms", {
        token: adminToken,
        body: { type: "DIRECT", targetUserId: villageA.guardOnDuty.id },
      });
      expect(res.status).toBe(400);
    });

    it("targetUserId from another village 404s (RLS-scoped user lookup)", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageB.admin.id },
      });
      expect(res.status).toBe(404);
    });

    it("GROUP creation is admin-only (guard/resident get 403)", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "GROUP", name: "ทดสอบ" },
      });
      expect(res.status).toBe(403);
    });

    it("admin can create an extra GROUP room", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/chat-rooms", {
        token: adminToken,
        body: { type: "GROUP", name: "กลุ่มทดสอบ", residentsCanPost: true },
      });
      expect(res.status).toBe(201);
      expect(res.body.type).toBe("GROUP");
      expect(res.body.residentsCanPost).toBe(true);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await api(baseUrl, "POST", "/chat-rooms", {
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /chat-rooms — lazy village-group provisioning + participant scoping", () => {
    it("auto-provisions and includes the village GROUP room on first call", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/chat-rooms", {
        token: residentToken,
      });
      expect(res.status).toBe(200);
      expect(
        res.body.some(
          (r: any) => r.type === "GROUP" && r.name === "กลุ่มหมู่บ้าน",
        ),
      ).toBe(true);
    });

    it("village A's rooms are never visible to village B (RLS)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const roomsA = await api(baseUrl, "GET", "/chat-rooms", {
        token: residentAToken,
      });
      const roomIdsA = new Set(roomsA.body.map((r: any) => r.id));

      const residentBToken = await loginToken(
        baseUrl,
        villageB.resident.phone,
        villageB.villageId,
      );
      const roomsB = await api(baseUrl, "GET", "/chat-rooms", {
        token: residentBToken,
      });
      expect(roomsB.body.some((r: any) => roomIdsA.has(r.id))).toBe(false);
    });

    it("a resident does not see a DIRECT room they aren't a participant of", async () => {
      const directRoom = await api(baseUrl, "POST", "/chat-rooms", {
        token: await loginToken(
          baseUrl,
          villageA.resident.phone,
          villageA.villageId,
        ),
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const resident2Token = await loginToken(
        baseUrl,
        residentB2Phone,
        villageA.villageId,
      );
      const rooms = await api(baseUrl, "GET", "/chat-rooms", {
        token: resident2Token,
      });
      expect(rooms.body.some((r: any) => r.id === directRoom.body.id)).toBe(
        false,
      );
    });
  });

  describe("GET /chat-rooms/:id/messages — room-membership authorization (ADR-005 point 4)", () => {
    it("a non-participant in the SAME village is rejected with 403", async () => {
      const directRoom = await api(baseUrl, "POST", "/chat-rooms", {
        token: await loginToken(
          baseUrl,
          villageA.resident.phone,
          villageA.villageId,
        ),
        body: { type: "DIRECT", targetUserId: villageA.guardOffDuty.id },
      });

      const outsiderToken = await loginToken(
        baseUrl,
        residentB2Phone,
        villageA.villageId,
      );
      const res = await api(
        baseUrl,
        "GET",
        `/chat-rooms/${directRoom.body.id}/messages`,
        { token: outsiderToken },
      );
      expect(res.status).toBe(403);
    });

    it("a user from ANOTHER village is rejected (RLS hides the participant row entirely)", async () => {
      const directRoom = await api(baseUrl, "POST", "/chat-rooms", {
        token: await loginToken(
          baseUrl,
          villageA.resident.phone,
          villageA.villageId,
        ),
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const villageBAdminToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const res = await api(
        baseUrl,
        "GET",
        `/chat-rooms/${directRoom.body.id}/messages`,
        { token: villageBAdminToken },
      );
      expect(res.status).toBe(403);
    });

    it("a participant can read paginated history", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const res = await api(
        baseUrl,
        "GET",
        `/chat-rooms/${room.body.id}/messages?page=1&pageSize=10`,
        { token: adminToken },
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 10 });
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await api(
        baseUrl,
        "GET",
        "/chat-rooms/00000000-0000-0000-0000-000000000000/messages",
      );
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /chat-rooms/:id — admin-only residentsCanPost toggle", () => {
    it("resident is rejected with 403", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const rooms = await api(baseUrl, "GET", "/chat-rooms", {
        token: residentToken,
      });
      const groupRoom = rooms.body.find(
        (r: any) => r.type === "GROUP" && r.name === "กลุ่มหมู่บ้าน",
      );

      const res = await api(baseUrl, "PATCH", `/chat-rooms/${groupRoom.id}`, {
        token: residentToken,
        body: { residentsCanPost: true },
      });
      expect(res.status).toBe(403);
    });

    it("admin can flip residentsCanPost on the default GROUP room", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const rooms = await api(baseUrl, "GET", "/chat-rooms", {
        token: adminToken,
      });
      const groupRoom = rooms.body.find(
        (r: any) => r.type === "GROUP" && r.name === "กลุ่มหมู่บ้าน",
      );

      const res = await api(baseUrl, "PATCH", `/chat-rooms/${groupRoom.id}`, {
        token: adminToken,
        body: { residentsCanPost: true },
      });
      expect(res.status).toBe(200);
      expect(res.body.residentsCanPost).toBe(true);
    });

    it("rejects updating a DIRECT room with 400", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const res = await api(baseUrl, "PATCH", `/chat-rooms/${room.body.id}`, {
        token: adminToken,
        body: { residentsCanPost: true },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /chat-rooms/:id/read", () => {
    it("a participant can mark a room read", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.guardOnDuty.id },
      });

      const res = await api(
        baseUrl,
        "PATCH",
        `/chat-rooms/${room.body.id}/read`,
        {
          token: residentToken,
        },
      );
      expect(res.status).toBe(200);
      expect(res.body.lastReadAt).not.toBeNull();
    });

    it("a non-participant is rejected with 403", async () => {
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: await loginToken(
          baseUrl,
          villageA.resident.phone,
          villageA.villageId,
        ),
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });
      const outsiderToken = await loginToken(
        baseUrl,
        residentB2Phone,
        villageA.villageId,
      );
      const res = await api(
        baseUrl,
        "PATCH",
        `/chat-rooms/${room.body.id}/read`,
        {
          token: outsiderToken,
        },
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST /chat-rooms/:id/image — attachment upload requires membership", () => {
    const TINY_PNG_DATA_URL =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    it("a participant can upload an image and gets back a URL", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const res = await api(
        baseUrl,
        "POST",
        `/chat-rooms/${room.body.id}/image`,
        {
          token: residentToken,
          body: { photoDataUrl: TINY_PNG_DATA_URL },
        },
      );
      expect(res.status).toBe(201);
      expect(typeof res.body.imageUrl).toBe("string");
      expect(res.body.imageUrl).toContain("village-entry-logs");
    });

    it("a non-participant is rejected with 403", async () => {
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: await loginToken(
          baseUrl,
          villageA.resident.phone,
          villageA.villageId,
        ),
        body: { type: "DIRECT", targetUserId: villageA.guardOnDuty.id },
      });
      const outsiderToken = await loginToken(
        baseUrl,
        residentB2Phone,
        villageA.villageId,
      );
      const res = await api(
        baseUrl,
        "POST",
        `/chat-rooms/${room.body.id}/image`,
        {
          token: outsiderToken,
          body: { photoDataUrl: TINY_PNG_DATA_URL },
        },
      );
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------
  // WebSocket — real socket.io-client against the live ChatGateway.
  // ---------------------------------------------------------------------

  function connect(token: string | undefined): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(baseUrl, {
        auth: token !== undefined ? { token } : undefined,
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      const timer = setTimeout(
        () => reject(new Error("connect timeout")),
        5000,
      );
      socket.on("connect", () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /** Waits for a `disconnect` event (or resolves false on timeout, meaning it stayed connected). */
  function waitForDisconnect(
    socket: Socket,
    timeoutMs = 2000,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      socket.on("disconnect", () => {
        if (!done) {
          done = true;
          resolve(true);
        }
      });
      setTimeout(() => {
        if (!done) {
          done = true;
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  function waitForEvent<T = any>(
    socket: Socket,
    event: string,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for "${event}"`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function emitAck<T = any>(
    socket: Socket,
    event: string,
    payload: unknown,
  ): Promise<T> {
    return new Promise((resolve) => {
      socket.emit(event, payload, (ack: T) => resolve(ack));
    });
  }

  describe("WS handshake auth (ADR-005 point 1)", () => {
    it("connects and stays connected with a valid access token", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const socket = await connect(token);
      expect(socket.connected).toBe(true);
      socket.close();
    }, 10_000);

    it("is disconnected immediately with no token", async () => {
      // The transport-level connection succeeds (Socket.io connects first,
      // then Nest's handleConnection runs and disconnects) — so we assert on
      // "gets disconnected shortly after", not on connect() rejecting.
      const socket = io(baseUrl, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      const disconnected = await waitForDisconnect(socket);
      expect(disconnected).toBe(true);
      socket.close();
    }, 10_000);

    it("is disconnected immediately with an invalid token", async () => {
      const socket = io(baseUrl, {
        auth: { token: "not-a-real-jwt" },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      const disconnected = await waitForDisconnect(socket);
      expect(disconnected).toBe(true);
      socket.close();
    }, 10_000);
  });

  describe("WS room-level authorization (ADR-005 point 4) + real-time delivery", () => {
    it("join_room succeeds for a participant, and a room-membership error is emitted for a non-participant", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.guardOnDuty.id },
      });

      const residentSocket = await connect(residentToken);
      const joinAck = await emitAck(residentSocket, "join_room", {
        chatRoomId: room.body.id,
      });
      expect(joinAck).toMatchObject({ ok: true, chatRoomId: room.body.id });

      const outsiderToken = await loginToken(
        baseUrl,
        residentB2Phone,
        villageA.villageId,
      );
      const outsiderSocket = await connect(outsiderToken);
      const exceptionPromise = waitForEvent(outsiderSocket, "exception");
      outsiderSocket.emit("join_room", { chatRoomId: room.body.id });
      const exception = await exceptionPromise;
      expect(exception).toMatchObject({
        status: "error",
        statusCode: 403,
      });

      residentSocket.close();
      outsiderSocket.close();
    }, 15_000);

    it("cross-village join is rejected (RLS hides the participant row entirely)", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const villageBToken = await loginToken(
        baseUrl,
        villageB.resident.phone,
        villageB.villageId,
      );
      const villageBSocket = await connect(villageBToken);
      const exceptionPromise = waitForEvent(villageBSocket, "exception");
      villageBSocket.emit("join_room", { chatRoomId: room.body.id });
      const exception = await exceptionPromise;
      expect(exception).toMatchObject({ status: "error", statusCode: 403 });

      villageBSocket.close();
    }, 15_000);

    it("send_message persists and broadcasts in real time to every socket that joined the room", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const residentSocket = await connect(residentToken);
      const adminSocket = await connect(adminToken);
      await emitAck(residentSocket, "join_room", { chatRoomId: room.body.id });
      await emitAck(adminSocket, "join_room", { chatRoomId: room.body.id });

      const adminReceivedPromise = waitForEvent(adminSocket, "new_message");
      residentSocket.emit("send_message", {
        chatRoomId: room.body.id,
        message: "สวัสดีครับ ขอสอบถามเรื่องที่จอดรถ",
      });
      const received = await adminReceivedPromise;
      expect(received).toMatchObject({
        chatRoomId: room.body.id,
        senderId: villageA.resident.id,
        message: "สวัสดีครับ ขอสอบถามเรื่องที่จอดรถ",
      });

      // History via REST matches what was delivered over the socket.
      const history = await api(
        baseUrl,
        "GET",
        `/chat-rooms/${room.body.id}/messages`,
        {
          token: adminToken,
        },
      );
      expect(history.body.items.some((m: any) => m.id === received.id)).toBe(
        true,
      );

      residentSocket.close();
      adminSocket.close();
    }, 15_000);

    it("residentsCanPost=false rejects a resident posting in the GROUP room; admin broadcast still works", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );

      // Ensure the default group room is (re)set to read-only for this test,
      // independent of the earlier PATCH test's mutation.
      const rooms = await api(baseUrl, "GET", "/chat-rooms", {
        token: adminToken,
      });
      const groupRoom = rooms.body.find(
        (r: any) => r.type === "GROUP" && r.name === "กลุ่มหมู่บ้าน",
      );
      await api(baseUrl, "PATCH", `/chat-rooms/${groupRoom.id}`, {
        token: adminToken,
        body: { residentsCanPost: false },
      });

      const residentSocket = await connect(residentToken);
      await emitAck(residentSocket, "join_room", { chatRoomId: groupRoom.id });

      const exceptionPromise = waitForEvent(residentSocket, "exception");
      residentSocket.emit("send_message", {
        chatRoomId: groupRoom.id,
        message: "แอบโพสต์",
      });
      const exception = await exceptionPromise;
      expect(exception).toMatchObject({ status: "error", statusCode: 403 });

      // Admin can still broadcast.
      const adminSocket = await connect(adminToken);
      await emitAck(adminSocket, "join_room", { chatRoomId: groupRoom.id });
      const residentReceivedPromise = waitForEvent(
        residentSocket,
        "new_message",
      );
      adminSocket.emit("send_message", {
        chatRoomId: groupRoom.id,
        message: "ประกาศจากนิติบุคคล",
      });
      const received = await residentReceivedPromise;
      expect(received).toMatchObject({
        message: "ประกาศจากนิติบุคคล",
        senderId: villageA.admin.id,
      });

      // Flip it open and confirm the resident can now post.
      await api(baseUrl, "PATCH", `/chat-rooms/${groupRoom.id}`, {
        token: adminToken,
        body: { residentsCanPost: true },
      });
      const adminReceivedPromise = waitForEvent(adminSocket, "new_message");
      residentSocket.emit("send_message", {
        chatRoomId: groupRoom.id,
        message: "ขอบคุณครับ",
      });
      const openReceived = await adminReceivedPromise;
      expect(openReceived).toMatchObject({
        message: "ขอบคุณครับ",
        senderId: villageA.resident.id,
      });

      residentSocket.close();
      adminSocket.close();
    }, 20_000);

    it("mark_read updates lastReadAt and broadcasts a read_receipt to the room", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const residentSocket = await connect(residentToken);
      const adminSocket = await connect(adminToken);
      await emitAck(residentSocket, "join_room", { chatRoomId: room.body.id });
      await emitAck(adminSocket, "join_room", { chatRoomId: room.body.id });

      const residentReceivedPromise = waitForEvent(
        residentSocket,
        "read_receipt",
      );
      adminSocket.emit("mark_read", { chatRoomId: room.body.id });
      const receipt = await residentReceivedPromise;
      expect(receipt).toMatchObject({
        chatRoomId: room.body.id,
        userId: villageA.admin.id,
      });

      residentSocket.close();
      adminSocket.close();
    }, 15_000);
  });

  describe("WS send_message rate limiting", () => {
    it("rejects a burst beyond the per-user limit with a WsException", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });
      const socket = await connect(residentToken);
      await emitAck(socket, "join_room", { chatRoomId: room.body.id });

      // Gateway's limiter allows 20 messages / 10s per user — burst 25 and
      // expect at least one exception event for exceeding the limit.
      const exceptionSeen = waitForEvent(socket, "exception", 8000);
      for (let i = 0; i < 25; i++) {
        socket.emit("send_message", {
          chatRoomId: room.body.id,
          message: `flood ${i}`,
        });
      }
      const exception = await exceptionSeen;
      expect(exception).toMatchObject({
        status: "error",
        message: expect.stringContaining("Too many messages"),
      });

      socket.close();
    }, 15_000);
  });

  describe("WS typing event", () => {
    it("re-broadcasts typing to other room members but not back to the sender", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const room = await api(baseUrl, "POST", "/chat-rooms", {
        token: residentToken,
        body: { type: "DIRECT", targetUserId: villageA.admin.id },
      });

      const residentSocket = await connect(residentToken);
      const adminSocket = await connect(adminToken);
      await emitAck(residentSocket, "join_room", { chatRoomId: room.body.id });
      await emitAck(adminSocket, "join_room", { chatRoomId: room.body.id });

      let residentSawOwnTyping = false;
      residentSocket.on("typing", () => {
        residentSawOwnTyping = true;
      });

      const adminReceivedTyping = waitForEvent(adminSocket, "typing");
      residentSocket.emit("typing", { chatRoomId: room.body.id });
      const typingPayload = await adminReceivedTyping;
      expect(typingPayload).toMatchObject({
        chatRoomId: room.body.id,
        userId: villageA.resident.id,
      });

      await new Promise((r) => setTimeout(r, 200));
      expect(residentSawOwnTyping).toBe(false);

      residentSocket.close();
      adminSocket.close();
    }, 15_000);
  });
});
