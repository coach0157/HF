/**
 * e2e coverage for Epic 10 — Transport Directory (spec 2.7 /
 * docs/PHASE2_BACKLOG.md Epic 10). Pattern mirrors
 * test/house-announcement-mgmt.e2e-spec.ts: RBAC (@Roles guard matches the
 * intended role set), cross-tenant isolation (RLS via
 * getTenantPrismaClient), and the AC-critical scenario — a resident must
 * never see inactive rows, even across an admin toggling one off.
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

describe("Transport Directory (Epic 10) — API-driven e2e", () => {
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

    villageA = await createVillageFixture("TRP-A", "81");
    villageB = await createVillageFixture("TRP-B", "82");
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  async function createProvider(
    adminToken: string,
    overrides: Partial<{
      name: string;
      type: string;
      phone: string;
      serviceArea: string;
    }> = {},
  ) {
    const res = await api(baseUrl, "POST", "/transport-providers", {
      token: adminToken,
      body: {
        name: "Somchai Motorcycle",
        type: "MOTORCYCLE",
        phone: "0811111111",
        serviceArea: "หน้าหมู่บ้าน",
        ...overrides,
      },
    });
    return res;
  }

  describe("POST /transport-providers — RBAC + validation", () => {
    it("admin can create a provider", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await createProvider(adminToken);
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Somchai Motorcycle");
      expect(res.body.villageId).toBe(villageA.villageId);
      expect(res.body.isActive).toBe(true);
    });

    it("resident is rejected with 403", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await createProvider(residentToken);
      expect(res.status).toBe(403);
    });

    it("guard is rejected with 403", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await createProvider(guardToken);
      expect(res.status).toBe(403);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await createProvider("");
      expect(res.status).toBe(401);
    });

    it("invalid type enum value is rejected with 400", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await createProvider(adminToken, { type: "UFO" });
      expect(res.status).toBe(400);
    });

    it("invalid phone format is rejected with 400", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await createProvider(adminToken, { phone: "12345" });
      expect(res.status).toBe(400);
    });

    it("missing required name is rejected with 400", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/transport-providers", {
        token: adminToken,
        body: { type: "TAXI", phone: "0822222222" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /transport-providers — visibility scoping + cross-tenant isolation", () => {
    it("full lifecycle: created (active) -> resident sees it -> admin deactivates -> resident no longer sees it, admin still does", async () => {
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

      const created = await createProvider(adminToken, {
        name: "Lifecycle Taxi",
      });
      expect(created.status).toBe(201);
      const id = created.body.id as string;

      const residentListBefore = await api(
        baseUrl,
        "GET",
        "/transport-providers",
        { token: residentToken },
      );
      expect(residentListBefore.status).toBe(200);
      expect(
        residentListBefore.body.some((p: any) => p.id === id),
      ).toBe(true);

      const toggle = await api(
        baseUrl,
        "PATCH",
        `/transport-providers/${id}`,
        { token: adminToken, body: { isActive: false } },
      );
      expect(toggle.status).toBe(200);
      expect(toggle.body.isActive).toBe(false);

      const residentListAfter = await api(
        baseUrl,
        "GET",
        "/transport-providers",
        { token: residentToken },
      );
      expect(residentListAfter.status).toBe(200);
      expect(
        residentListAfter.body.some((p: any) => p.id === id),
      ).toBe(false);

      const adminListAfter = await api(
        baseUrl,
        "GET",
        "/transport-providers",
        { token: adminToken },
      );
      expect(adminListAfter.status).toBe(200);
      expect(adminListAfter.body.some((p: any) => p.id === id)).toBe(true);
    });

    it("resident cannot see inactive rows even by passing ?active=false itself", async () => {
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

      const created = await createProvider(adminToken, {
        name: "Hidden Van",
      });
      const id = created.body.id as string;
      await api(baseUrl, "PATCH", `/transport-providers/${id}`, {
        token: adminToken,
        body: { isActive: false },
      });

      const res = await api(
        baseUrl,
        "GET",
        "/transport-providers?active=false",
        { token: residentToken },
      );
      expect(res.status).toBe(200);
      expect(res.body.some((p: any) => p.id === id)).toBe(false);
    });

    it("guard sees only active providers too", async () => {
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

      const created = await createProvider(adminToken, {
        name: "Guard-visible Taxi",
      });
      const activeId = created.body.id as string;

      const inactive = await createProvider(adminToken, {
        name: "Guard-hidden Taxi",
      });
      await api(baseUrl, "PATCH", `/transport-providers/${inactive.body.id}`, {
        token: adminToken,
        body: { isActive: false },
      });

      const res = await api(baseUrl, "GET", "/transport-providers", {
        token: guardToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.some((p: any) => p.id === activeId)).toBe(true);
      expect(res.body.some((p: any) => p.id === inactive.body.id)).toBe(
        false,
      );
    });

    it("?type= filter narrows results for every role", async () => {
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

      await createProvider(adminToken, { name: "Van Filter Test", type: "VAN" });

      const res = await api(
        baseUrl,
        "GET",
        "/transport-providers?type=VAN",
        { token: residentToken },
      );
      expect(res.status).toBe(200);
      expect(res.body.every((p: any) => p.type === "VAN")).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("village A never sees village B's providers (RLS)", async () => {
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

      const bProvider = await createProvider(adminBToken, {
        name: "Village B Only",
      });
      expect(bProvider.status).toBe(201);

      const res = await api(baseUrl, "GET", "/transport-providers", {
        token: adminAToken,
      });
      expect(res.status).toBe(200);
      expect(
        res.body.some((p: any) => p.id === bProvider.body.id),
      ).toBe(false);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await api(baseUrl, "GET", "/transport-providers");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /transport-providers/:id — RBAC + cross-tenant isolation", () => {
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
      const created = await createProvider(adminToken);
      const res = await api(
        baseUrl,
        "PATCH",
        `/transport-providers/${created.body.id}`,
        { token: residentToken, body: { name: "hacked" } },
      );
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
      const created = await createProvider(adminToken);
      const res = await api(
        baseUrl,
        "PATCH",
        `/transport-providers/${created.body.id}`,
        { token: guardToken, body: { name: "hacked" } },
      );
      expect(res.status).toBe(403);
    });

    it("village B admin cannot edit village A's provider (404, RLS hides the row)", async () => {
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
      const created = await createProvider(adminAToken);
      const res = await api(
        baseUrl,
        "PATCH",
        `/transport-providers/${created.body.id}`,
        { token: adminBToken, body: { name: "cross-tenant hack attempt" } },
      );
      expect(res.status).toBe(404);
    });

    it("404 when the row doesn't exist", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(
        baseUrl,
        "PATCH",
        "/transport-providers/00000000-0000-0000-0000-000000000000",
        { token: adminToken, body: { name: "nope" } },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /transport-providers/:id — RBAC + cross-tenant isolation", () => {
    it("admin can delete (204) and it disappears from the admin's own list", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const created = await createProvider(adminToken, {
        name: "To be deleted",
      });

      const delRes = await api(
        baseUrl,
        "DELETE",
        `/transport-providers/${created.body.id}`,
        { token: adminToken },
      );
      expect(delRes.status).toBe(204);

      const listRes = await api(baseUrl, "GET", "/transport-providers", {
        token: adminToken,
      });
      expect(
        listRes.body.some((p: any) => p.id === created.body.id),
      ).toBe(false);
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
      const created = await createProvider(adminToken);
      const res = await api(
        baseUrl,
        "DELETE",
        `/transport-providers/${created.body.id}`,
        { token: residentToken },
      );
      expect(res.status).toBe(403);
    });

    it("village B admin cannot delete village A's provider (404, not a silent no-op)", async () => {
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
      const created = await createProvider(adminAToken, {
        name: "Should survive cross-tenant delete attempt",
      });

      const res = await api(
        baseUrl,
        "DELETE",
        `/transport-providers/${created.body.id}`,
        { token: adminBToken },
      );
      expect(res.status).toBe(404);

      const listRes = await api(baseUrl, "GET", "/transport-providers", {
        token: adminAToken,
      });
      expect(
        listRes.body.some((p: any) => p.id === created.body.id),
      ).toBe(true);
    });
  });
});
