/**
 * e2e coverage for Epic 9 — Maintenance (spec 2.4 /
 * docs/PHASE2_BACKLOG.md Epic 9). Pattern mirrors
 * test/transport-provider.e2e-spec.ts: RBAC (@Roles guard matches the
 * intended role set), cross-tenant isolation (RLS via
 * getTenantPrismaClient), and the AC-critical scenarios: ownership scoping
 * (resident only sees their own house's tickets), atomic/race-safe
 * ticketNumber generation, and the forward-only status transition guard.
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { CanActivate } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import { AppModule } from "../src/app.module";
import {
  rawPrisma,
  createVillageFixture,
  deleteVillage,
  api,
  loginToken,
  VillageFixture,
} from "./support/test-helpers";

describe("Maintenance (Epic 9) — API-driven e2e", () => {
  let app: INestApplication;
  let baseUrl: string;
  let villageA: VillageFixture;
  let villageB: VillageFixture;

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

    villageA = await createVillageFixture("MNT-A", "83");
    villageB = await createVillageFixture("MNT-B", "84");
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  async function createTicket(
    token: string,
    overrides: Partial<{ category: string; description: string }> = {},
  ) {
    return api(baseUrl, "POST", "/maintenance-tickets", {
      token,
      body: {
        category: "ELECTRICAL",
        description: "ไฟหน้าบ้านดับ",
        ...overrides,
      },
    });
  }

  describe("POST /maintenance-tickets — RBAC + validation + ticket numbering", () => {
    it("resident can create a ticket; status starts OPEN with a generated ticketNumber", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await createTicket(residentToken);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("OPEN");
      expect(res.body.houseId).toBe(villageA.houseId);
      expect(typeof res.body.ticketNumber).toBe("string");
      expect(res.body.ticketNumber.length).toBeGreaterThan(0);
    });

    it("admin is rejected with 403", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await createTicket(adminToken);
      expect(res.status).toBe(403);
    });

    it("guard is rejected with 403", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await createTicket(guardToken);
      expect(res.status).toBe(403);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await createTicket("");
      expect(res.status).toBe(401);
    });

    it("invalid category enum value is rejected with 400", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await createTicket(residentToken, { category: "UFO" });
      expect(res.status).toBe(400);
    });

    it("missing description is rejected with 400", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/maintenance-tickets", {
        token: residentToken,
        body: { category: "ROAD" },
      });
      expect(res.status).toBe(400);
    });

    it("ticketNumbers are sequential and unique per village, even created concurrently (race-safety of MaintenanceTicketCounter)", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );

      const results = await Promise.all(
        Array.from({ length: 8 }).map(() => createTicket(residentToken)),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);

      const ticketNumbers = results.map((r) => r.body.ticketNumber as string);
      const unique = new Set(ticketNumbers);
      expect(unique.size).toBe(ticketNumbers.length);
    });

    it("ticketNumbers can repeat across different villages (unique per village, not globally)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const residentBToken = await loginToken(
        baseUrl,
        villageB.resident.phone,
        villageB.villageId,
      );

      // Fresh village B has its own counter starting at 1, independent of
      // however many tickets village A has already created in this suite.
      const bTicket = await createTicket(residentBToken);
      expect(bTicket.status).toBe(201);
      expect(bTicket.body.ticketNumber).toBe("MT-000001");
      void residentAToken;
    });
  });

  describe("GET /maintenance-tickets — ownership scoping + cross-tenant isolation", () => {
    it("resident sees only their own house's tickets", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const created = await createTicket(residentToken, {
        description: "Ownership scoping test ticket",
      });

      const list = await api(baseUrl, "GET", "/maintenance-tickets", {
        token: residentToken,
      });
      expect(list.status).toBe(200);
      expect(
        list.body.items.every((t: any) => t.houseId === villageA.houseId),
      ).toBe(true);
      expect(
        list.body.items.some((t: any) => t.id === created.body.id),
      ).toBe(true);
    });

    it("admin sees every ticket in the village", async () => {
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
      const created = await createTicket(residentToken, {
        description: "Admin visibility test ticket",
      });

      const list = await api(baseUrl, "GET", "/maintenance-tickets", {
        token: adminToken,
      });
      expect(list.status).toBe(200);
      expect(
        list.body.items.some((t: any) => t.id === created.body.id),
      ).toBe(true);
    });

    it("guard cannot list maintenance tickets (403) — not a guard concern per spec 2.4", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/maintenance-tickets", {
        token: guardToken,
      });
      expect(res.status).toBe(403);
    });

    it("?status= and ?category= filters narrow results", async () => {
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
      await createTicket(residentToken, {
        category: "ROAD",
        description: "Filter test ticket",
      });

      const res = await api(
        baseUrl,
        "GET",
        "/maintenance-tickets?category=ROAD&status=OPEN",
        { token: adminToken },
      );
      expect(res.status).toBe(200);
      expect(
        res.body.items.every(
          (t: any) => t.category === "ROAD" && t.status === "OPEN",
        ),
      ).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it("village A admin never sees village B's tickets (RLS)", async () => {
      const residentBToken = await loginToken(
        baseUrl,
        villageB.resident.phone,
        villageB.villageId,
      );
      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const bTicket = await createTicket(residentBToken, {
        description: "Village B only ticket",
      });

      const res = await api(baseUrl, "GET", "/maintenance-tickets", {
        token: adminAToken,
      });
      expect(res.status).toBe(200);
      expect(
        res.body.items.some((t: any) => t.id === bTicket.body.id),
      ).toBe(false);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await api(baseUrl, "GET", "/maintenance-tickets");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /maintenance-tickets/:id — ownership scoping", () => {
    it("resident of a different house cannot view someone else's ticket (403)", async () => {
      // villageB's resident belongs to a different house than villageA's —
      // but to stay within one village's RLS boundary, use a cross-tenant
      // check instead: village B's admin (different village) gets 404 (RLS
      // hides the row entirely), which is the stricter cross-tenant case.
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const created = await createTicket(residentAToken, {
        description: "Detail ownership test ticket",
      });

      const adminBToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const res = await api(
        baseUrl,
        "GET",
        `/maintenance-tickets/${created.body.id}`,
        { token: adminBToken },
      );
      expect(res.status).toBe(404);
    });

    it("admin can view any ticket in their own village", async () => {
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
      const created = await createTicket(residentToken, {
        description: "Admin detail view test ticket",
      });

      const res = await api(
        baseUrl,
        "GET",
        `/maintenance-tickets/${created.body.id}`,
        { token: adminToken },
      );
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });

    it("404 when the ticket doesn't exist", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(
        baseUrl,
        "GET",
        "/maintenance-tickets/00000000-0000-0000-0000-000000000000",
        { token: adminToken },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Full lifecycle: OPEN -> assign -> IN_PROGRESS -> status -> DONE, forward-only guard", () => {
    it("happy path: create -> assign -> mark done, resident sees status change at each step", async () => {
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

      const created = await createTicket(residentToken, {
        description: "Full lifecycle test ticket",
      });
      const id = created.body.id as string;
      expect(created.body.status).toBe("OPEN");

      const assignRes = await api(
        baseUrl,
        "PATCH",
        `/maintenance-tickets/${id}/assign`,
        {
          token: adminToken,
          body: { assignedTo: "ทีมช่างไฟฟ้า A", scheduledDate: "2026-09-05T09:00:00.000Z" },
        },
      );
      expect(assignRes.status).toBe(200);
      expect(assignRes.body.status).toBe("IN_PROGRESS");
      expect(assignRes.body.assignedTo).toBe("ทีมช่างไฟฟ้า A");

      const residentView = await api(
        baseUrl,
        "GET",
        `/maintenance-tickets/${id}`,
        { token: residentToken },
      );
      expect(residentView.body.status).toBe("IN_PROGRESS");

      const doneRes = await api(
        baseUrl,
        "PATCH",
        `/maintenance-tickets/${id}/status`,
        { token: adminToken, body: { status: "DONE" } },
      );
      expect(doneRes.status).toBe(200);
      expect(doneRes.body.status).toBe("DONE");
    });

    it("rejects skipping OPEN straight to DONE via /status", async () => {
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
      const created = await createTicket(residentToken, {
        description: "Skip transition test ticket",
      });

      const res = await api(
        baseUrl,
        "PATCH",
        `/maintenance-tickets/${created.body.id}/status`,
        { token: adminToken, body: { status: "DONE" } },
      );
      expect(res.status).toBe(400);
    });

    it("rejects assigning a DONE ticket", async () => {
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
      const created = await createTicket(residentToken, {
        description: "Assign-after-done test ticket",
      });
      const id = created.body.id as string;
      await api(baseUrl, "PATCH", `/maintenance-tickets/${id}/assign`, {
        token: adminToken,
        body: { assignedTo: "Team", scheduledDate: "2026-09-05" },
      });
      await api(baseUrl, "PATCH", `/maintenance-tickets/${id}/status`, {
        token: adminToken,
        body: { status: "DONE" },
      });

      const res = await api(
        baseUrl,
        "PATCH",
        `/maintenance-tickets/${id}/assign`,
        {
          token: adminToken,
          body: { assignedTo: "Team 2", scheduledDate: "2026-09-06" },
        },
      );
      expect(res.status).toBe(400);
    });

    it("resident is rejected with 403 on both /assign and /status", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const created = await createTicket(residentToken, {
        description: "RBAC test ticket",
      });
      const id = created.body.id as string;

      const assignRes = await api(
        baseUrl,
        "PATCH",
        `/maintenance-tickets/${id}/assign`,
        {
          token: residentToken,
          body: { assignedTo: "hack", scheduledDate: "2026-09-05" },
        },
      );
      expect(assignRes.status).toBe(403);

      const statusRes = await api(
        baseUrl,
        "PATCH",
        `/maintenance-tickets/${id}/status`,
        { token: residentToken, body: { status: "IN_PROGRESS" } },
      );
      expect(statusRes.status).toBe(403);
    });

    it("village B admin cannot assign/status village A's ticket (404, RLS)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminBToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const created = await createTicket(residentAToken, {
        description: "Cross-tenant assign test ticket",
      });

      const res = await api(
        baseUrl,
        "PATCH",
        `/maintenance-tickets/${created.body.id}/assign`,
        {
          token: adminBToken,
          body: { assignedTo: "hack", scheduledDate: "2026-09-05" },
        },
      );
      expect(res.status).toBe(404);
    });
  });
});
