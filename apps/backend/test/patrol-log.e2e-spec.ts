/**
 * e2e coverage for Epic 12 — Guard Patrol Log (user request, not in the
 * original spec — see docs/PHASE2_BACKLOG.md §5). Pattern mirrors
 * test/transport-provider.e2e-spec.ts: RBAC (@Roles guard matches the
 * intended role set), cross-tenant isolation (RLS via
 * getTenantPrismaClient), plus the epic's own AC-critical scenario — note
 * and GPS are genuinely optional, not just optional-looking DTO fields that
 * the service secretly requires.
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

const SMALL_IMAGE =
  "data:image/jpeg;base64," + Buffer.from("tiny-fake-patrol-photo").toString("base64");

describe("Guard Patrol Log (Epic 12) — API-driven e2e", () => {
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

    villageA = await createVillageFixture("PTL-A", "91");
    villageB = await createVillageFixture("PTL-B", "92");
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  async function createPatrolLog(
    token: string,
    overrides: Partial<{
      photoDataUrl: string;
      note: string;
      latitude: number;
      longitude: number;
    }> = {},
  ) {
    return api(baseUrl, "POST", "/patrol-logs", {
      token,
      body: { photoDataUrl: SMALL_IMAGE, ...overrides },
    });
  }

  describe("POST /patrol-logs — RBAC + validation", () => {
    it("guard can create a patrol log with just a photo (note/GPS both optional)", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await createPatrolLog(guardToken);
      expect(res.status).toBe(201);
      expect(res.body.villageId).toBe(villageA.villageId);
      expect(res.body.guardUserId).toBe(villageA.guardOnDuty.id);
      expect(res.body.note).toBeNull();
      expect(res.body.latitude).toBeNull();
      expect(res.body.longitude).toBeNull();
      expect(res.body.photoUrl).toContain("village-patrol-logs");
      expect(res.body.createdAt).toBeTruthy();
    });

    it("guard can create a patrol log with note + GPS", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOffDuty.phone,
        villageA.villageId,
      );
      const res = await createPatrolLog(guardToken, {
        note: "ตรวจรอบประตูหลังหมู่บ้าน",
        latitude: 13.75,
        longitude: 100.53,
      });
      expect(res.status).toBe(201);
      expect(res.body.note).toBe("ตรวจรอบประตูหลังหมู่บ้าน");
      expect(Number(res.body.latitude)).toBeCloseTo(13.75, 5);
      expect(Number(res.body.longitude)).toBeCloseTo(100.53, 5);
    });

    it("admin is rejected with 403 — only GUARD may record a patrol", async () => {
      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await createPatrolLog(adminToken);
      expect(res.status).toBe(403);
    });

    it("resident is rejected with 403", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await createPatrolLog(residentToken);
      expect(res.status).toBe(403);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await createPatrolLog("");
      expect(res.status).toBe(401);
    });

    it("missing photoDataUrl is rejected with 400 — a patrol log requires a photo", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/patrol-logs", {
        token: guardToken,
        body: { note: "no photo attached" },
      });
      expect(res.status).toBe(400);
    });

    it("out-of-range latitude is rejected with 400", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await createPatrolLog(guardToken, { latitude: 999 });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /patrol-logs — RBAC + visibility + cross-tenant isolation", () => {
    it("admin sees a patrol log recorded by any guard, not just one", async () => {
      const guard1Token = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const guard2Token = await loginToken(
        baseUrl,
        villageA.guardOffDuty.phone,
        villageA.villageId,
      );
      const log1 = await createPatrolLog(guard1Token, { note: "guard1 patrol" });
      const log2 = await createPatrolLog(guard2Token, { note: "guard2 patrol" });

      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/patrol-logs", { token: adminToken });
      expect(res.status).toBe(200);
      const ids = res.body.items.map((i: any) => i.id);
      expect(ids).toContain(log1.body.id);
      expect(ids).toContain(log2.body.id);
    });

    it("a guard sees every guard's patrol logs, not just their own", async () => {
      const guard1Token = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const guard2Token = await loginToken(
        baseUrl,
        villageA.guardOffDuty.phone,
        villageA.villageId,
      );
      const otherGuardsLog = await createPatrolLog(guard1Token, {
        note: "seen by other guards too",
      });

      const res = await api(baseUrl, "GET", "/patrol-logs", { token: guard2Token });
      expect(res.status).toBe(200);
      expect(
        res.body.items.some((i: any) => i.id === otherGuardsLog.body.id),
      ).toBe(true);
    });

    it("resident is rejected with 403 — patrol logs are not resident-facing data", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/patrol-logs", { token: residentToken });
      expect(res.status).toBe(403);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await api(baseUrl, "GET", "/patrol-logs");
      expect(res.status).toBe(401);
    });

    it("?date= filters to that calendar day only", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const created = await createPatrolLog(guardToken, { note: "today's patrol" });
      expect(created.status).toBe(201);

      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const today = new Date().toISOString().slice(0, 10);
      const todayRes = await api(
        baseUrl,
        "GET",
        `/patrol-logs?date=${today}`,
        { token: adminToken },
      );
      expect(todayRes.status).toBe(200);
      expect(
        todayRes.body.items.some((i: any) => i.id === created.body.id),
      ).toBe(true);

      const farPast = "2000-01-01";
      const pastRes = await api(
        baseUrl,
        "GET",
        `/patrol-logs?date=${farPast}`,
        { token: adminToken },
      );
      expect(pastRes.status).toBe(200);
      expect(
        pastRes.body.items.some((i: any) => i.id === created.body.id),
      ).toBe(false);
    });

    it("village A never sees village B's patrol logs (RLS)", async () => {
      const guardBToken = await loginToken(
        baseUrl,
        villageB.guardOnDuty.phone,
        villageB.villageId,
      );
      const bLog = await createPatrolLog(guardBToken, { note: "village B only" });
      expect(bLog.status).toBe(201);

      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/patrol-logs", { token: adminAToken });
      expect(res.status).toBe(200);
      expect(res.body.items.some((i: any) => i.id === bLog.body.id)).toBe(false);
    });
  });

  describe("GET /files/patrol-logs bucket — ADMIN/GUARD only", () => {
    it("resident cannot view a patrol photo even via the files endpoint", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const created = await createPatrolLog(guardToken);
      const ref = created.body.photoUrl as string;
      const match = /^local:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(ref)!;
      const [, bucket, villageId, filename] = match;

      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(
        baseUrl,
        "GET",
        `/files/${bucket}/${villageId}/${filename}`,
        { token: residentToken },
      );
      expect(res.status).toBe(403);

      const adminToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const adminRes = await api(
        baseUrl,
        "GET",
        `/files/${bucket}/${villageId}/${filename}`,
        { token: adminToken },
      );
      expect(adminRes.status).toBe(200);
    });
  });
});
