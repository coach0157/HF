/**
 * ADR-007 (docs/ARCHITECTURE.md) — e2e coverage for `GET
 * /files/:bucket/:villageId/:filename`, the endpoint added to fix "every
 * photo in the system is unviewable" (nothing ever served the
 * `local://bucket/village/filename` refs `FileStorageService.savePhoto()`
 * hands out). Pattern mirrors test/maintenance.e2e-spec.ts /
 * test/chat.e2e-spec.ts: real HTTP calls through the actual module stack
 * (entry-log/maintenance/chat/users), not mocks, so this proves the
 * reverse-lookup authorization actually works against real DB rows.
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { CanActivate } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { promises as fsPromises } from "node:fs";
import * as path from "node:path";
import { AppModule } from "../src/app.module";
import {
  rawPrisma,
  withVillageContext,
  createVillageFixture,
  deleteVillage,
  api,
  loginToken,
  nextPhone,
  futureIso,
  pastIso,
  VillageFixture,
} from "./support/test-helpers";

const SMALL_IMAGE =
  "data:image/jpeg;base64," + Buffer.from("tiny-fake-jpeg-bytes").toString("base64");

/** Splits a `local://bucket/village/filename` ref into a `GET /files/...` path. */
function filesPath(ref: string): string {
  const match = /^local:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(ref);
  if (!match) throw new Error(`not a local:// ref: ${ref}`);
  const [, bucket, villageId, filename] = match;
  return `/files/${bucket}/${villageId}/${filename}`;
}

function bucketFolder(ref: string): string {
  const match = /^local:\/\/([^/]+)\//.exec(ref);
  if (!match) throw new Error(`not a local:// ref: ${ref}`);
  return match[1];
}

describe("GET /files/:bucket/:villageId/:filename (ADR-007) — API-driven e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let villageA: VillageFixture;
  let villageB: VillageFixture;
  let house2Id: string;
  let resident2Phone: string;
  let resident2Id: string;

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

    villageA = await createVillageFixture("FIL-A", "71");
    villageB = await createVillageFixture("FIL-B", "72");

    // A second house + resident in villageA — needed for "another resident,
    // different house, must be rejected" ownership checks below.
    resident2Phone = nextPhone("71");
    await withVillageContext(villageA.villageId, async (tx) => {
      const house2 = await tx.house.create({
        data: { villageId: villageA.villageId, houseNo: "FIL-A-2", zone: "QA-ZONE" },
      });
      house2Id = house2.id;
      const resident2 = await tx.user.create({
        data: {
          villageId: villageA.villageId,
          name: "Resident FIL-A-2",
          phone: resident2Phone,
          role: "RESIDENT",
          houseId: house2.id,
        },
      });
      resident2Id = resident2.id;
    });
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  // -------------------------------------------------------------------
  // Auth mechanism: header token (normal) vs. ?token= query param (new,
  // scoped to this route only per ADR-007).
  // -------------------------------------------------------------------
  describe("authentication", () => {
    it("rejects with 401 when no token is supplied at all", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const avatarRes = await api(baseUrl, "PATCH", "/users/me/avatar", {
        token: adminToken,
        body: { photoDataUrl: SMALL_IMAGE },
      });
      const res = await api(baseUrl, "GET", filesPath(avatarRes.body.avatarUrl));
      expect(res.status).toBe(401);
    });

    it("rejects with 401 for a garbage token, header or query", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const avatarRes = await api(baseUrl, "PATCH", "/users/me/avatar", {
        token: adminToken,
        body: { photoDataUrl: SMALL_IMAGE },
      });
      const path_ = filesPath(avatarRes.body.avatarUrl);
      const headerRes = await api(baseUrl, "GET", path_, { token: "not-a-real-jwt" });
      expect(headerRes.status).toBe(401);
      const queryRes = await api(baseUrl, "GET", `${path_}?token=not-a-real-jwt`);
      expect(queryRes.status).toBe(401);
    });

    it("accepts the normal Authorization header", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const avatarRes = await api(baseUrl, "PATCH", "/users/me/avatar", {
        token: adminToken,
        body: { photoDataUrl: SMALL_IMAGE },
      });
      const res = await api(baseUrl, "GET", filesPath(avatarRes.body.avatarUrl), {
        token: adminToken,
      });
      expect(res.status).toBe(200);
    });

    it("accepts a ?token= query param with no Authorization header — this route only", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const avatarRes = await api(baseUrl, "PATCH", "/users/me/avatar", {
        token: adminToken,
        body: { photoDataUrl: SMALL_IMAGE },
      });
      const res = await api(
        baseUrl,
        "GET",
        `${filesPath(avatarRes.body.avatarUrl)}?token=${adminToken}`,
      );
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------
  // avatars bucket — any authenticated same-village role.
  // -------------------------------------------------------------------
  describe("avatars bucket", () => {
    it("any role in the same village can view another user's avatar", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const upload = await api(baseUrl, "PATCH", "/users/me/avatar", {
        token: residentToken,
        body: { photoDataUrl: SMALL_IMAGE },
      });
      const p = filesPath(upload.body.avatarUrl);

      const guardToken = await loginToken(baseUrl, villageA.guardOnDuty.phone, villageA.villageId);
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);

      expect((await api(baseUrl, "GET", p, { token: residentToken })).status).toBe(200);
      expect((await api(baseUrl, "GET", p, { token: guardToken })).status).toBe(200);
      expect((await api(baseUrl, "GET", p, { token: adminToken })).status).toBe(200);
    });

    it("cross-tenant: a villageB user cannot fetch villageA's avatar (404, tenant isolation)", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const upload = await api(baseUrl, "PATCH", "/users/me/avatar", {
        token: residentToken,
        body: { photoDataUrl: SMALL_IMAGE },
      });
      const p = filesPath(upload.body.avatarUrl);

      const adminBToken = await loginToken(baseUrl, villageB.admin.phone, villageB.villageId);
      const res = await api(baseUrl, "GET", p, { token: adminBToken });
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------
  // sensitive-id bucket — ADMIN/GUARD only, ADMIN view is audit-logged.
  // -------------------------------------------------------------------
  describe("sensitive-id bucket", () => {
    async function createManualEntryLog() {
      const guardToken = await loginToken(baseUrl, villageA.guardOnDuty.phone, villageA.villageId);
      const res = await api(baseUrl, "POST", "/entry-logs", {
        token: guardToken,
        body: {
          visitorName: "ID Card Visitor",
          houseId: villageA.houseId,
          photoDataUrl: SMALL_IMAGE,
        },
      });
      expect(res.status).toBe(201);
      return res.body.entryLog.photoUrl as string;
    }

    it("ADMIN can view it and the view is audit-logged", async () => {
      const ref = await createManualEntryLog();
      const p = filesPath(ref);

      const before = await withVillageContext(villageA.villageId, (tx) =>
        tx.auditLog.count({ where: { action: "VIEW_SENSITIVE_ID_PHOTO" } }),
      );

      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const res = await api(baseUrl, "GET", p, { token: adminToken });
      expect(res.status).toBe(200);

      const after = await withVillageContext(villageA.villageId, (tx) =>
        tx.auditLog.count({ where: { action: "VIEW_SENSITIVE_ID_PHOTO" } }),
      );
      expect(after).toBe(before + 1);
    });

    it("GUARD can view it, and it is NOT audit-logged (only ADMIN views are)", async () => {
      const ref = await createManualEntryLog();
      const p = filesPath(ref);

      const before = await withVillageContext(villageA.villageId, (tx) =>
        tx.auditLog.count({ where: { action: "VIEW_SENSITIVE_ID_PHOTO" } }),
      );

      const guardToken = await loginToken(baseUrl, villageA.guardOffDuty.phone, villageA.villageId);
      const res = await api(baseUrl, "GET", p, { token: guardToken });
      expect(res.status).toBe(200);

      const after = await withVillageContext(villageA.villageId, (tx) =>
        tx.auditLog.count({ where: { action: "VIEW_SENSITIVE_ID_PHOTO" } }),
      );
      expect(after).toBe(before);
    });

    it("RESIDENT is rejected with 403, even the visited house's own resident", async () => {
      const ref = await createManualEntryLog();
      const p = filesPath(ref);

      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const res = await api(baseUrl, "GET", p, { token: residentToken });
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------
  // entry-logs bucket, case 1: entry_logs.photo_url (QR-scan gate photo).
  // -------------------------------------------------------------------
  describe("entry-logs bucket — entry log photo (ownership by house)", () => {
    async function createQrEntryLogWithPhoto() {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentToken,
        body: {
          visitorName: "Gate Visitor",
          validFrom: pastIso(60_000),
          validTo: futureIso(3_600_000),
          usageType: "SINGLE",
        },
      });
      expect(passRes.status).toBe(201);

      const guardToken = await loginToken(baseUrl, villageA.guardOnDuty.phone, villageA.villageId);
      const entryRes = await api(baseUrl, "POST", "/entry-logs", {
        token: guardToken,
        body: { qrToken: passRes.body.qrToken, photoDataUrl: SMALL_IMAGE },
      });
      expect(entryRes.status).toBe(201);
      const ref = entryRes.body.entryLog.photoUrl as string;
      expect(ref).toContain("village-entry-logs");
      return ref;
    }

    it("GUARD and ADMIN can always view it", async () => {
      const p = filesPath(await createQrEntryLogWithPhoto());
      const guardToken = await loginToken(baseUrl, villageA.guardOnDuty.phone, villageA.villageId);
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      expect((await api(baseUrl, "GET", p, { token: guardToken })).status).toBe(200);
      expect((await api(baseUrl, "GET", p, { token: adminToken })).status).toBe(200);
    });

    it("the visited house's own RESIDENT can view it", async () => {
      const p = filesPath(await createQrEntryLogWithPhoto());
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      expect((await api(baseUrl, "GET", p, { token: residentToken })).status).toBe(200);
    });

    it("a RESIDENT of a different house is rejected with 403", async () => {
      const p = filesPath(await createQrEntryLogWithPhoto());
      const resident2Token = await loginToken(baseUrl, resident2Phone, villageA.villageId);
      expect((await api(baseUrl, "GET", p, { token: resident2Token })).status).toBe(403);
    });
  });

  // -------------------------------------------------------------------
  // entry-logs bucket, case 2: maintenance_tickets.image_url.
  // -------------------------------------------------------------------
  describe("entry-logs bucket — maintenance ticket photo (ownership by house, no GUARD access)", () => {
    async function createTicketWithPhoto(residentToken: string) {
      const res = await api(baseUrl, "POST", "/maintenance-tickets", {
        token: residentToken,
        body: { category: "ELECTRICAL", description: "ไฟดับ", photoDataUrl: SMALL_IMAGE },
      });
      expect(res.status).toBe(201);
      const ref = res.body.imageUrl as string;
      expect(ref).toContain("village-entry-logs");
      return ref;
    }

    it("ADMIN can always view it", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const p = filesPath(await createTicketWithPhoto(residentToken));
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      expect((await api(baseUrl, "GET", p, { token: adminToken })).status).toBe(200);
    });

    it("the owning house's RESIDENT can view it", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const p = filesPath(await createTicketWithPhoto(residentToken));
      expect((await api(baseUrl, "GET", p, { token: residentToken })).status).toBe(200);
    });

    it("a RESIDENT of a different house is rejected with 403", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const p = filesPath(await createTicketWithPhoto(residentToken));
      const resident2Token = await loginToken(baseUrl, resident2Phone, villageA.villageId);
      expect((await api(baseUrl, "GET", p, { token: resident2Token })).status).toBe(403);
    });

    it("GUARD is rejected with 403 — maintenance has no guard-facing access at all", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const p = filesPath(await createTicketWithPhoto(residentToken));
      const guardToken = await loginToken(baseUrl, villageA.guardOnDuty.phone, villageA.villageId);
      expect((await api(baseUrl, "GET", p, { token: guardToken })).status).toBe(403);
    });
  });

  // -------------------------------------------------------------------
  // entry-logs bucket, case 3: chat_messages.image_url — reuses
  // ChatService.assertCanJoin(), no ADMIN bypass.
  // -------------------------------------------------------------------
  describe("entry-logs bucket — chat image (room membership, no role bypass)", () => {
    it("a room participant can view it; a non-participant — including ADMIN — cannot", async () => {
      // resident2 <-> guardOffDuty DIRECT room, so villageA's admin is
      // deliberately NOT a participant of this specific room (proves no
      // automatic ADMIN bypass, not just "some non-member role is rejected").
      const resident2Token = await loginToken(baseUrl, resident2Phone, villageA.villageId);
      const guardToken = await loginToken(baseUrl, villageA.guardOffDuty.phone, villageA.villageId);

      const roomRes = await api(baseUrl, "POST", "/chat-rooms", {
        token: resident2Token,
        body: { type: "DIRECT", targetUserId: villageA.guardOffDuty.id },
      });
      expect(roomRes.status).toBe(201);
      const roomId = roomRes.body.id as string;

      const uploadRes = await api(baseUrl, "POST", `/chat-rooms/${roomId}/image`, {
        token: resident2Token,
        body: { photoDataUrl: SMALL_IMAGE },
      });
      expect(uploadRes.status).toBe(201);
      const imageUrl = uploadRes.body.imageUrl as string;
      expect(imageUrl).toContain("village-entry-logs");

      // attachImage() only saves the file + returns the ref — the row only
      // gets created when a message is actually sent (normally via the WS
      // send_message event, ChatService.sendMessage()). Seed that row
      // directly via Prisma so this test can assert against the endpoint's
      // reverse-lookup without standing up a socket.io client.
      await withVillageContext(villageA.villageId, (tx) =>
        tx.chatMessage.create({
          data: {
            villageId: villageA.villageId,
            chatRoomId: roomId,
            senderId: resident2Id,
            imageUrl,
          },
        }),
      );

      const p = filesPath(imageUrl);

      expect((await api(baseUrl, "GET", p, { token: resident2Token })).status).toBe(200);
      expect((await api(baseUrl, "GET", p, { token: guardToken })).status).toBe(200);

      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      expect((await api(baseUrl, "GET", p, { token: adminToken })).status).toBe(403);

      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      expect((await api(baseUrl, "GET", p, { token: residentToken })).status).toBe(403);
    });
  });

  // -------------------------------------------------------------------
  // Orphaned / forged ref -> 404, never leaks whether the row exists.
  // -------------------------------------------------------------------
  describe("orphaned ref", () => {
    it("404s a file that exists on disk but matches no entry_logs/maintenance_tickets/chat_messages row", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      // Any real "entry-logs"-bucket ref to learn this env's actual bucket
      // folder name from (S3_BUCKET_ENTRY_LOGS may be overridden per env).
      const ticketRes = await api(baseUrl, "POST", "/maintenance-tickets", {
        token: residentToken,
        body: { category: "ROAD", description: "test", photoDataUrl: SMALL_IMAGE },
      });
      const folder = bucketFolder(ticketRes.body.imageUrl as string);

      const filename = `${randomUUID()}.jpg`;
      const dir = path.resolve(process.cwd(), "uploads", folder, villageA.villageId);
      await fsPromises.mkdir(dir, { recursive: true });
      await fsPromises.writeFile(path.join(dir, filename), Buffer.from("orphaned"));

      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const res = await api(
        baseUrl,
        "GET",
        `/files/${folder}/${villageA.villageId}/${filename}`,
        { token: adminToken },
      );
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------
  // Path-traversal defense-in-depth (unit-tested exhaustively in
  // file-storage.service.spec.ts; this confirms it holds over real HTTP).
  // -------------------------------------------------------------------
  describe("path traversal", () => {
    it("404s a crafted filename containing '..'", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const res = await api(
        baseUrl,
        "GET",
        `/files/village-avatars/${villageA.villageId}/..%2f..%2fpackage.json`,
        { token: adminToken },
      );
      expect([400, 404]).toContain(res.status);
    });
  });
});
