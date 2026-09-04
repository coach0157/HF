/**
 * e2e coverage for the blocklist add-on (docs/PHASE2_BACKLOG.md §6 (Epic 13),
 * user-requested — see blocked-visitor.service.ts's doc comment). Pattern
 * mirrors test/transport-provider.e2e-spec.ts: RBAC, cross-tenant isolation
 * (RLS), plus an integration section proving the block actually stops a
 * resident's QR creation and a guard's manual entry, not just the CRUD
 * endpoints themselves.
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
  futureIso,
  VillageFixture,
} from "./support/test-helpers";

describe("Blocked Visitors (blocklist add-on) — API-driven e2e", () => {
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

    villageA = await createVillageFixture("BLK-A", "91");
    villageB = await createVillageFixture("BLK-B", "92");
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  async function createBlocked(
    adminToken: string,
    overrides: Partial<{ phone: string; vehiclePlate: string; reason: string }> = {},
  ) {
    return api(baseUrl, "POST", "/blocked-visitors", {
      token: adminToken,
      body: { phone: "0888888888", reason: "test entry", ...overrides },
    });
  }

  describe("POST /blocked-visitors — RBAC + validation", () => {
    it("admin can create a phone-only entry", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const res = await createBlocked(adminToken);
      expect(res.status).toBe(201);
      expect(res.body.phone).toBe("0888888888");
      expect(res.body.villageId).toBe(villageA.villageId);
    });

    it("resident is rejected with 403", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const res = await createBlocked(residentToken);
      expect(res.status).toBe(403);
    });

    it("guard is rejected with 403", async () => {
      const guardToken = await loginToken(baseUrl, villageA.guardOnDuty.phone, villageA.villageId);
      const res = await createBlocked(guardToken);
      expect(res.status).toBe(403);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await createBlocked("");
      expect(res.status).toBe(401);
    });

    it("an entry with neither phone nor vehiclePlate is rejected with 400", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const res = await api(baseUrl, "POST", "/blocked-visitors", {
        token: adminToken,
        body: { reason: "no contact info" },
      });
      expect(res.status).toBe(400);
    });

    it("invalid phone format is rejected with 400", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const res = await createBlocked(adminToken, { phone: "12345" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /blocked-visitors — cross-tenant isolation", () => {
    it("village A never sees village B's blocked visitors (RLS)", async () => {
      const adminAToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const adminBToken = await loginToken(baseUrl, villageB.admin.phone, villageB.villageId);

      const bEntry = await createBlocked(adminBToken, { phone: "0877777777" });
      expect(bEntry.status).toBe(201);

      const res = await api(baseUrl, "GET", "/blocked-visitors", { token: adminAToken });
      expect(res.status).toBe(200);
      expect(res.body.some((e: any) => e.id === bEntry.body.id)).toBe(false);
    });

    it("resident is rejected with 403", async () => {
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);
      const res = await api(baseUrl, "GET", "/blocked-visitors", { token: residentToken });
      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /blocked-visitors/:id — RBAC + cross-tenant isolation", () => {
    it("admin can delete (204) and it disappears from the list", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const created = await createBlocked(adminToken, { phone: "0866666666" });

      const delRes = await api(baseUrl, "DELETE", `/blocked-visitors/${created.body.id}`, {
        token: adminToken,
      });
      expect(delRes.status).toBe(204);

      const listRes = await api(baseUrl, "GET", "/blocked-visitors", { token: adminToken });
      expect(listRes.body.some((e: any) => e.id === created.body.id)).toBe(false);
    });

    it("village B admin cannot delete village A's entry (404, not a silent no-op)", async () => {
      const adminAToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const adminBToken = await loginToken(baseUrl, villageB.admin.phone, villageB.villageId);
      const created = await createBlocked(adminAToken, { phone: "0855555555" });

      const res = await api(baseUrl, "DELETE", `/blocked-visitors/${created.body.id}`, {
        token: adminBToken,
      });
      expect(res.status).toBe(404);
    });
  });

  describe("Integration — the block list actually stops resident QR creation and guard manual entry", () => {
    it("a blocked phone number cannot be used to create a visitor pass, but an unblocked one still can", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const residentToken = await loginToken(baseUrl, villageA.resident.phone, villageA.villageId);

      const blocked = await createBlocked(adminToken, {
        phone: "0844444444",
        reason: "harassed a resident",
      });
      expect(blocked.status).toBe(201);

      const rejected = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentToken,
        body: {
          visitorName: "Banned Guy",
          visitorPhone: "0844444444",
          validFrom: futureIso(1_000),
          validTo: futureIso(3_600_000),
          usageType: "SINGLE",
        },
      });
      expect(rejected.status).toBe(403);

      const allowed = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentToken,
        body: {
          visitorName: "Fine Guy",
          visitorPhone: "0833333333",
          validFrom: futureIso(1_000),
          validTo: futureIso(3_600_000),
          usageType: "SINGLE",
        },
      });
      expect(allowed.status).toBe(201);
    });

    it("a blocked vehicle plate cannot be used for a guard's manual entry", async () => {
      const adminToken = await loginToken(baseUrl, villageA.admin.phone, villageA.villageId);
      const guardToken = await loginToken(baseUrl, villageA.guardOnDuty.phone, villageA.villageId);

      const blocked = await createBlocked(adminToken, {
        phone: undefined,
        vehiclePlate: "1กข9999",
        reason: "stolen plate report",
      } as any);
      expect(blocked.status).toBe(201);

      const rejected = await api(baseUrl, "POST", "/entry-logs", {
        token: guardToken,
        body: {
          visitorName: "Suspicious Van",
          vehiclePlate: "1กข9999",
          houseId: villageA.houseId,
          photoDataUrl: "data:image/jpeg;base64,xx",
        },
      });
      expect(rejected.status).toBe(403);
    });
  });
});
