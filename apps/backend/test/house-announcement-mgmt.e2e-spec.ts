/**
 * QA addition — e2e coverage for the two Dev-agent-added surfaces that had
 * NO prior test coverage (see docs/QA_REPORT.md "QA pass 2"):
 *  - `GET/POST /houses` (house.controller.ts) — new module, not in the
 *    original spec 3.3 endpoint list, added by Dev to unblock Admin
 *    Dashboard screens (house assignment, SOS house-number display).
 *  - `PATCH/DELETE /announcements/:id` (announcement.controller.ts) — new
 *    endpoints on an existing module, added by Dev to unblock the Admin
 *    Dashboard's announcement edit/delete screen.
 *
 * Focus: RBAC (@Roles guard matches the intended role set), cross-tenant
 * isolation (RLS via getTenantPrismaClient — a village must never see or
 * mutate another village's houses/announcements), and basic DTO validation.
 * Also regression-covers the QA fix in announcement.service.ts's list()
 * (flattenTargetHouseIds) that makes HOUSE-scope edits round-trip correctly
 * instead of silently dropping previously-targeted houses.
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { CanActivate } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import { AppModule } from "../src/app.module";
import {
  rawPrisma,
  withVillageContext,
  createVillageFixture,
  deleteVillage,
  api,
  loginToken,
  VillageFixture,
} from "./support/test-helpers";

describe("House module + Announcement PATCH/DELETE (API-driven e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let villageA: VillageFixture;
  let villageB: VillageFixture;
  let houseA2: string; // a SECOND house in village A (fixture only creates one)
  let houseB1: string;

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

    villageA = await createVillageFixture("HAM-A", "71");
    villageB = await createVillageFixture("HAM-B", "72");

    houseA2 = await withVillageContext(villageA.villageId, (tx) =>
      tx.house
        .create({
          data: {
            villageId: villageA.villageId,
            houseNo: "HAM-A2",
            zone: "Z2",
          },
        })
        .then((h) => h.id),
    );
    houseB1 = villageB.houseId;
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  describe("POST /houses — RBAC", () => {
    it("admin can create a house", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/houses", {
        token: adminToken,
        body: { houseNo: "HAM-A-NEW-1", zone: "Z1" },
      });
      expect(res.status).toBe(201);
      expect(res.body.houseNo).toBe("HAM-A-NEW-1");
      expect(res.body.villageId).toBe(villageA.villageId);
    });

    it("resident is rejected with 403", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/houses", {
        token: residentToken,
        body: { houseNo: "HAM-SHOULD-NOT-EXIST" },
      });
      expect(res.status).toBe(403);
    });

    it("guard is rejected with 403 (list-only role, not create)", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/houses", {
        token: guardToken,
        body: { houseNo: "HAM-SHOULD-NOT-EXIST-2" },
      });
      expect(res.status).toBe(403);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await api(baseUrl, "POST", "/houses", {
        body: { houseNo: "HAM-NOPE" },
      });
      expect(res.status).toBe(401);
    });

    it("duplicate houseNo within the same village is rejected with 409", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const first = await api(baseUrl, "POST", "/houses", {
        token: adminToken,
        body: { houseNo: "HAM-A-DUP" },
      });
      expect(first.status).toBe(201);
      const second = await api(baseUrl, "POST", "/houses", {
        token: adminToken,
        body: { houseNo: "HAM-A-DUP" },
      });
      expect(second.status).toBe(409);
    });

    it("the SAME houseNo is allowed again in a DIFFERENT village (uniqueness is per-village, not global)", async () => {
      const adminBToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const res = await api(baseUrl, "POST", "/houses", {
        token: adminBToken,
        body: { houseNo: "HAM-A-DUP" }, // same string used in village A above
      });
      expect(res.status).toBe(201);
    });

    it("invalid latitude (out of -90..90 range) is rejected with 400", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/houses", {
        token: adminToken,
        body: { houseNo: "HAM-BAD-LAT", latitude: 999 },
      });
      expect(res.status).toBe(400);
    });

    it("missing required houseNo is rejected with 400", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/houses", {
        token: adminToken,
        body: { zone: "Z1" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /houses, GET /houses/:id — RBAC + cross-tenant isolation", () => {
    it("admin and guard can list houses; resident is rejected with 403", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );

      const adminRes = await api(baseUrl, "GET", "/houses", {
        token: adminToken,
      });
      expect(adminRes.status).toBe(200);

      const guardRes = await api(baseUrl, "GET", "/houses", {
        token: guardToken,
      });
      expect(guardRes.status).toBe(200);

      const residentRes = await api(baseUrl, "GET", "/houses", {
        token: residentToken,
      });
      expect(residentRes.status).toBe(403);
    });

    it("village A's house list never includes village B's houses (RLS)", async () => {
      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/houses", { token: adminAToken });
      expect(res.status).toBe(200);
      expect(
        res.body.every((h: any) => h.villageId === villageA.villageId),
      ).toBe(true);
      expect(res.body.some((h: any) => h.id === houseB1)).toBe(false);
    });

    it("village A admin cannot fetch village B's house by id directly (404, not the real row)", async () => {
      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", `/houses/${houseB1}`, {
        token: adminAToken,
      });
      expect(res.status).toBe(404);
    });

    it("fetching your own village's house by id succeeds", async () => {
      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", `/houses/${houseA2}`, {
        token: adminAToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(houseA2);
    });

    // Mobile Dev-agent round: backend gap flagged in MVP_BACKLOG.md Epic 6
    // ("GET /houses/:id เป็น GUARD/ADMIN-only วันนี้") — resident's own
    // ProfileScreen needs house_no/zone. Opened to RESIDENT, scoped to their
    // own house only (house.service.ts's findOne()).
    it("a resident can fetch their own house by id", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", `/houses/${villageA.houseId}`, {
        token: residentToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(villageA.houseId);
    });

    it("a resident cannot fetch a different house in the same village (403)", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", `/houses/${houseA2}`, {
        token: residentToken,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /announcements/:id — RBAC + cross-tenant isolation", () => {
    async function createHouseScopeAnnouncement(adminToken: string) {
      const res = await api(baseUrl, "POST", "/announcements", {
        token: adminToken,
        body: {
          title: "Original title",
          content: "Original content",
          level: "NORMAL",
          targetScope: "HOUSE",
          targetHouseIds: [villageA.houseId, houseA2],
        },
      });
      expect(res.status).toBe(201);
      return res.body.announcement.id as string;
    }

    it("admin can edit title/content/level", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const id = await createHouseScopeAnnouncement(adminToken);
      const res = await api(baseUrl, "PATCH", `/announcements/${id}`, {
        token: adminToken,
        body: { title: "Updated title", level: "IMPORTANT" },
      });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated title");
      expect(res.body.level).toBe("IMPORTANT");
    });

    it("resident is rejected with 403", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const id = await createHouseScopeAnnouncement(adminToken);
      const res = await api(baseUrl, "PATCH", `/announcements/${id}`, {
        token: residentToken,
        body: { title: "hacked" },
      });
      expect(res.status).toBe(403);
    });

    it("guard is rejected with 403", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const id = await createHouseScopeAnnouncement(adminToken);
      const res = await api(baseUrl, "PATCH", `/announcements/${id}`, {
        token: guardToken,
        body: { title: "hacked" },
      });
      expect(res.status).toBe(403);
    });

    it("village B admin cannot edit village A's announcement (404, RLS hides the row)", async () => {
      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const adminBToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const id = await createHouseScopeAnnouncement(adminAToken);
      const res = await api(baseUrl, "PATCH", `/announcements/${id}`, {
        token: adminBToken,
        body: { title: "cross-tenant hack attempt" },
      });
      expect(res.status).toBe(404);
    });

    it("invalid level enum value is rejected with 400", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const id = await createHouseScopeAnnouncement(adminToken);
      const res = await api(baseUrl, "PATCH", `/announcements/${id}`, {
        token: adminToken,
        body: { level: "CATASTROPHIC" },
      });
      expect(res.status).toBe(400);
    });

    it("switching to ZONE scope without targetZone is rejected with 400", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const id = await createHouseScopeAnnouncement(adminToken);
      const res = await api(baseUrl, "PATCH", `/announcements/${id}`, {
        token: adminToken,
        body: { targetScope: "ZONE" },
      });
      expect(res.status).toBe(400);
    });

    it("regression: GET /announcements returns targetHouseIds so a partial re-selection on PATCH does exactly what the admin asked (no silent extra drop) — proves the QA fix round-trips", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const id = await createHouseScopeAnnouncement(adminToken);

      // list() must return both houses that were targeted at creation time.
      const listRes = await api(baseUrl, "GET", "/announcements", {
        token: adminToken,
      });
      expect(listRes.status).toBe(200);
      const created = listRes.body.find((a: any) => a.id === id);
      expect(created).toBeDefined();
      expect(new Set(created.targetHouseIds)).toEqual(
        new Set([villageA.houseId, houseA2]),
      );

      // Admin now edits using exactly what the (fixed) preload gave them,
      // dropping houseA2 deliberately by only re-sending villageA.houseId.
      const patchRes = await api(baseUrl, "PATCH", `/announcements/${id}`, {
        token: adminToken,
        body: { targetHouseIds: [villageA.houseId] },
      });
      expect(patchRes.status).toBe(200);

      const listRes2 = await api(baseUrl, "GET", "/announcements", {
        token: adminToken,
      });
      const updated = listRes2.body.find((a: any) => a.id === id);
      expect(updated.targetHouseIds).toEqual([villageA.houseId]);
    });
  });

  describe("DELETE /announcements/:id — RBAC + cross-tenant isolation", () => {
    async function createAllScopeAnnouncement(adminToken: string) {
      const res = await api(baseUrl, "POST", "/announcements", {
        token: adminToken,
        body: {
          title: "To be deleted",
          content: "content",
          level: "NORMAL",
          targetScope: "ALL",
        },
      });
      expect(res.status).toBe(201);
      return res.body.announcement.id as string;
    }

    it("admin can delete (204) and it disappears from the feed", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const id = await createAllScopeAnnouncement(adminToken);

      const delRes = await api(baseUrl, "DELETE", `/announcements/${id}`, {
        token: adminToken,
      });
      expect(delRes.status).toBe(204);

      const listRes = await api(baseUrl, "GET", "/announcements", {
        token: adminToken,
      });
      expect(listRes.body.some((a: any) => a.id === id)).toBe(false);
    });

    it("resident is rejected with 403", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const id = await createAllScopeAnnouncement(adminToken);

      const res = await api(baseUrl, "DELETE", `/announcements/${id}`, {
        token: residentToken,
      });
      expect(res.status).toBe(403);
    });

    it("guard is rejected with 403", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const id = await createAllScopeAnnouncement(adminToken);

      const res = await api(baseUrl, "DELETE", `/announcements/${id}`, {
        token: guardToken,
      });
      expect(res.status).toBe(403);
    });

    it("village B admin cannot delete village A's announcement (404, not silently a no-op success)", async () => {
      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const adminBToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const id = await createAllScopeAnnouncement(adminAToken);

      const res = await api(baseUrl, "DELETE", `/announcements/${id}`, {
        token: adminBToken,
      });
      expect(res.status).toBe(404);

      // Confirm it's genuinely still there for village A afterwards.
      const listRes = await api(baseUrl, "GET", "/announcements", {
        token: adminAToken,
      });
      expect(listRes.body.some((a: any) => a.id === id)).toBe(true);
    });
  });
});
