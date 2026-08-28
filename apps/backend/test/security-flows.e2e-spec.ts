/**
 * API-driven e2e coverage for the acceptance criteria QA was specifically
 * asked to verify (village-security-app-spec.md + docs/MVP_BACKLOG.md):
 *  - Cross-tenant isolation enforced through the real HTTP endpoints (not
 *    just raw SQL — see test/rls.e2e-spec.ts for the DB-level proof).
 *  - RBAC: a resident hitting an admin/guard-only endpoint gets 403.
 *  - Exit-confirm flow: re-scanning a QR at the exit gate must NOT set
 *    exit_time; only an explicit confirm-exit call may.
 *  - QR revoke: a revoked pass cannot be scanned even before its natural
 *    expiry.
 *  - SOS routing: only guards currently ON_DUTY are in routedToGuardUserIds.
 *  - Audit log: an admin revoking someone else's visitor pass writes an
 *    audit_logs row; a resident revoking their own pass does not.
 *  - Multi-village phone number: login without villageId returns 409 with
 *    the candidate village list (a documented Dev-known-gap behavior, not a
 *    bug — verified here that it fails closed rather than picking a village
 *    silently).
 *
 * Boots the real Nest AppModule (full middleware/guard/interceptor stack,
 * i.e. the actual TenantContextMiddleware -> JwtAuthGuard -> RolesGuard ->
 * RlsInterceptor chain from docs/ARCHITECTURE.md) against the same Postgres
 * instance used by the rest of the suite, and drives it over real HTTP
 * (fetch) rather than calling services directly.
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
  loginAs,
  nextPhone,
  futureIso,
  pastIso,
  VillageFixture,
} from "./support/test-helpers";

describe("Security & acceptance-criteria flows (API-driven e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let villageA: VillageFixture;
  let villageB: VillageFixture;

  beforeAll(async () => {
    // Per-account/per-IP throttles (5 OTP requests/min per IP, SOS 5/30s, QR
    // create 30/hour, etc. — see common.module.ts + per-user-throttle.ts)
    // are covered by reading the source, not by racing real clocks in CI.
    // This suite logs in many distinct actors from the same machine (same
    // IP), which alone blows past the 5/min OTP-request limit — a real
    // effect of the app's own rate-limiting working correctly, not a bug.
    //
    // QA NOTE: `.overrideGuard(ThrottlerGuard)` (the documented NestJS
    // testing-module API for this) did NOT intercept the actual requests —
    // real ThrottlerException 429s still occurred, either because Nest's
    // per-request instantiation of an APP_GUARD-registered global guard
    // doesn't consistently pick up DI overrides in this Nest 11 /
    // @nestjs/throttler 6.5 combination, or a nuance not chased down further
    // (out of scope for this QA pass — flagged in docs/QA_REPORT.md).
    // Patching the shared prototype method is a blunt but reliable
    // test-only workaround: it affects every ThrottlerGuard instance
    // regardless of how DI constructs it, and only for this test process.
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

    villageA = await createVillageFixture("SEC-A", "91");
    villageB = await createVillageFixture("SEC-B", "92");
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  function passBody(
    visitorName: string,
    usageType: "SINGLE" | "MULTI" = "SINGLE",
  ) {
    return {
      visitorName,
      validFrom: pastIso(60_000),
      validTo: futureIso(3_600_000),
      usageType,
    };
  }

  describe("Cross-tenant isolation via API", () => {
    it("village A cannot revoke a visitor pass created in village B (404, not 403 — RLS hides the row entirely)", async () => {
      const residentBToken = await loginToken(
        baseUrl,
        villageB.resident.phone,
        villageB.villageId,
      );
      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentBToken,
        body: passBody("Guest B"),
      });
      expect(passRes.status).toBe(201);

      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const revokeRes = await api(
        baseUrl,
        "PATCH",
        `/visitor-passes/${passRes.body.id}/revoke`,
        {
          token: residentAToken,
        },
      );
      expect(revokeRes.status).toBe(404);
    });

    it("village A admin cannot view a user record from village B", async () => {
      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", `/users/${villageB.resident.id}`, {
        token: adminAToken,
      });
      expect(res.status).toBe(404);
    });

    // Mobile Dev-agent round: backend gap flagged in MVP_BACKLOG.md Epic 7
    // ("GET /users/:id เป็น ADMIN-only วันนี้" — Guard SOS list needs the
    // caller's phone for the callback button). Opened to GUARD (any user in
    // the village) and RESIDENT (own record only, see users.service.ts).
    it("a guard can fetch any resident's user record (SOS callback lookup)", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", `/users/${villageA.resident.id}`, {
        token: guardToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(villageA.resident.id);
      expect(res.body.phone).toBe(villageA.resident.phone);
    });

    it("a resident can fetch their own user record", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", `/users/${villageA.resident.id}`, {
        token: residentToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(villageA.resident.id);
    });

    it("a resident cannot fetch another user's record in the same village (403)", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(
        baseUrl,
        "GET",
        `/users/${villageA.guardOnDuty.id}`,
        { token: residentToken },
      );
      expect(res.status).toBe(403);
    });

    it("village B cannot see or read village A entry logs", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const guardAToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );

      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("Guest A2"),
      });
      const entryRes = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken: passRes.body.qrToken },
      });
      expect(entryRes.status).toBe(201);
      const entryLogId = entryRes.body.entryLog.id;

      const adminBToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const listRes = await api(baseUrl, "GET", "/entry-logs", {
        token: adminBToken,
      });
      expect(listRes.status).toBe(200);
      expect(listRes.body.items.some((i: any) => i.id === entryLogId)).toBe(
        false,
      );

      const getOneRes = await api(baseUrl, "GET", `/entry-logs/${entryLogId}`, {
        token: adminBToken,
      });
      expect(getOneRes.status).toBe(404);
    });

    it("village B does not see village A SOS alerts", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const sosRes = await api(baseUrl, "POST", "/sos-alerts", {
        token: residentAToken,
        body: { latitude: 13.7, longitude: 100.5 },
      });
      expect(sosRes.status).toBe(201);

      const adminBToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const listRes = await api(baseUrl, "GET", "/sos-alerts", {
        token: adminBToken,
      });
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((a: any) => a.id === sosRes.body.alert.id)).toBe(
        false,
      );
    });
  });

  describe("RBAC (403 for wrong role)", () => {
    it("resident cannot create announcements (admin only)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/announcements", {
        token: residentAToken,
        body: { title: "x", content: "y", level: "NORMAL", targetScope: "ALL" },
      });
      expect(res.status).toBe(403);
    });

    it("resident cannot acknowledge an SOS alert (guard only)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const sosRes = await api(baseUrl, "POST", "/sos-alerts", {
        token: residentAToken,
        body: {},
      });
      const res = await api(
        baseUrl,
        "PATCH",
        `/sos-alerts/${sosRes.body.alert.id}/acknowledge`,
        {
          token: residentAToken,
        },
      );
      expect(res.status).toBe(403);
    });

    it("guard cannot create a visitor pass (resident only)", async () => {
      const guardAToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/visitor-passes", {
        token: guardAToken,
        body: passBody("x"),
      });
      expect(res.status).toBe(403);
    });

    it("resident cannot list guard shifts (admin only)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/guard-shifts", {
        token: residentAToken,
      });
      expect(res.status).toBe(403);
    });

    it("resident cannot create users (admin only)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/users", {
        token: residentAToken,
        body: { name: "x", phone: nextPhone("93"), role: "RESIDENT" },
      });
      expect(res.status).toBe(403);
    });

    it("unauthenticated request is rejected with 401, not 403", async () => {
      const res = await api(baseUrl, "GET", "/announcements", {});
      expect(res.status).toBe(401);
    });
  });

  describe("Exit-confirm flow (spec 2.1: no auto-close on re-scan)", () => {
    it("re-scanning the QR at the exit gate does NOT set exit_time; only an explicit confirm-exit call does", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const guardAToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );

      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("ExitFlowGuest"),
      });

      const entryRes = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken: passRes.body.qrToken },
      });
      expect(entryRes.status).toBe(201);
      expect(entryRes.body.alreadyEntered).toBe(false);
      expect(entryRes.body.entryLog.exitTime).toBeNull();
      const entryLogId = entryRes.body.entryLog.id;

      // Guard re-scans the SAME QR at the exit gate — spec 2.1's critical rule.
      const rescanRes = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken: passRes.body.qrToken },
      });
      expect(rescanRes.status).toBe(201);
      expect(rescanRes.body.alreadyEntered).toBe(true);
      expect(rescanRes.body.entryLog.id).toBe(entryLogId);
      expect(rescanRes.body.entryLog.exitTime).toBeNull(); // must NOT auto-close

      const readRes = await api(baseUrl, "GET", `/entry-logs/${entryLogId}`, {
        token: guardAToken,
      });
      expect(readRes.body.exitTime).toBeNull();

      // The explicit confirm step.
      const confirmRes = await api(
        baseUrl,
        "PATCH",
        `/entry-logs/${entryLogId}/confirm-exit`,
        {
          token: guardAToken,
        },
      );
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.exitTime).not.toBeNull();
      expect(confirmRes.body.exitConfirmationMethod).toBe("GUARD");

      // Confirming a second time must fail — already confirmed.
      const confirmAgainRes = await api(
        baseUrl,
        "PATCH",
        `/entry-logs/${entryLogId}/confirm-exit`,
        {
          token: guardAToken,
        },
      );
      expect(confirmAgainRes.status).toBe(400);
    });

    it("the visited resident can confirm exit as the second confirmation path", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const guardAToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );

      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("ResidentConfirmGuest"),
      });
      const entryRes = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken: passRes.body.qrToken },
      });
      const entryLogId = entryRes.body.entryLog.id;

      const confirmRes = await api(
        baseUrl,
        "PATCH",
        `/entry-logs/${entryLogId}/confirm-exit`,
        {
          token: residentAToken,
        },
      );
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.exitConfirmationMethod).toBe("RESIDENT");
    });

    it("a resident of a different village cannot confirm exit for someone else's visitor (cross-tenant, 404)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const guardAToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("WrongVillageGuest"),
      });
      const entryRes = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken: passRes.body.qrToken },
      });
      const entryLogId = entryRes.body.entryLog.id;

      const residentBToken = await loginToken(
        baseUrl,
        villageB.resident.phone,
        villageB.villageId,
      );
      const res = await api(
        baseUrl,
        "PATCH",
        `/entry-logs/${entryLogId}/confirm-exit`,
        { token: residentBToken },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("QR revoke", () => {
    it("a revoked pass cannot be scanned or used for entry, even before its natural expiry", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const guardAToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );

      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("RevokeMe"),
      });
      const { id: passId, qrToken } = passRes.body;

      const revokeRes = await api(
        baseUrl,
        "PATCH",
        `/visitor-passes/${passId}/revoke`,
        { token: residentAToken },
      );
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.status).toBe("REVOKED");

      const scanRes = await api(baseUrl, "GET", `/visitor-passes/${qrToken}`, {
        token: guardAToken,
      });
      expect(scanRes.status).toBe(403);

      const entryRes = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken },
      });
      expect(entryRes.status).toBe(403);
    });

    it("revoke is idempotent, and revoking twice does not error", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("RevokeTwice"),
      });
      const first = await api(
        baseUrl,
        "PATCH",
        `/visitor-passes/${passRes.body.id}/revoke`,
        {
          token: residentAToken,
        },
      );
      const second = await api(
        baseUrl,
        "PATCH",
        `/visitor-passes/${passRes.body.id}/revoke`,
        {
          token: residentAToken,
        },
      );
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.status).toBe("REVOKED");
    });
  });

  // Mobile Dev-agent round: backend gap flagged in MVP_BACKLOG.md Epic 6
  // ("ไม่มี GET /visitor-passes (list-by-resident)") — the Resident app's
  // InviteGuestScreen "รายการ QR ที่สร้างไว้" list needed this endpoint.
  describe("GET /visitor-passes (resident's own list)", () => {
    it("a resident only sees passes they created, never another resident's", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("MyGuest"),
      });

      // A second resident in village A, so there is another villager's pass
      // in the same tenant that must NOT show up in residentA's list.
      const otherResident = await withVillageContext(villageA.villageId, (tx) =>
        tx.user.create({
          data: {
            villageId: villageA.villageId,
            name: "Other Resident A",
            phone: nextPhone("93"),
            role: "RESIDENT",
            houseId: villageA.houseId,
          },
        }),
      );
      const otherResidentToken = await loginToken(
        baseUrl,
        otherResident.phone,
        villageA.villageId,
      );
      await api(baseUrl, "POST", "/visitor-passes", {
        token: otherResidentToken,
        body: passBody("OtherGuest"),
      });

      const res = await api(baseUrl, "GET", "/visitor-passes", {
        token: residentAToken,
      });
      expect(res.status).toBe(200);
      expect(
        res.body.items.every(
          (p: any) => p.createdByUserId === villageA.resident.id,
        ),
      ).toBe(true);
      expect(
        res.body.items.some((p: any) => p.visitorName === "OtherGuest"),
      ).toBe(false);
      expect(res.body.items.some((p: any) => p.visitorName === "MyGuest")).toBe(
        true,
      );
    });

    it("guard/admin cannot call the resident-only list endpoint (403)", async () => {
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "GET", "/visitor-passes", {
        token: guardToken,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("SOS routing (spec 2.2: on_duty guards only)", () => {
    it("routes only to the on-duty guard, excludes the off-duty guard", async () => {
      const onDutyToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const offDutyToken = await loginToken(
        baseUrl,
        villageA.guardOffDuty.phone,
        villageA.villageId,
      );

      const startOnDuty = await api(baseUrl, "POST", "/guard-shifts", {
        token: onDutyToken,
        body: {},
      });
      expect(startOnDuty.status).toBe(201);

      // Give the "off duty" guard an actual (closed) shift row — proves
      // routing excludes them because status != ON_DUTY, not merely because
      // they never had a shift row at all.
      const startOffDuty = await api(baseUrl, "POST", "/guard-shifts", {
        token: offDutyToken,
        body: {},
      });
      const endOffDuty = await api(
        baseUrl,
        "PATCH",
        `/guard-shifts/${startOffDuty.body.id}`,
        {
          token: offDutyToken,
        },
      );
      expect(endOffDuty.status).toBe(200);
      expect(endOffDuty.body.status).toBe("OFF_DUTY");

      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const sosRes = await api(baseUrl, "POST", "/sos-alerts", {
        token: residentAToken,
        body: { latitude: 13.75, longitude: 100.5 },
      });
      expect(sosRes.status).toBe(201);
      expect(sosRes.body.routedToGuardUserIds).toContain(
        villageA.guardOnDuty.id,
      );
      expect(sosRes.body.routedToGuardUserIds).not.toContain(
        villageA.guardOffDuty.id,
      );

      const ackRes = await api(
        baseUrl,
        "PATCH",
        `/sos-alerts/${sosRes.body.alert.id}/acknowledge`,
        {
          token: onDutyToken,
        },
      );
      expect(ackRes.status).toBe(200);
      expect(ackRes.body.status).toBe("ACKNOWLEDGED");

      // Clean up the open shift so it doesn't affect later tests in this file.
      await api(baseUrl, "PATCH", `/guard-shifts/${startOnDuty.body.id}`, {
        token: onDutyToken,
      });
    });
  });

  // Mobile Dev-agent round QA fix: GuardHomeScreen had no way to read a
  // guard's own current shift, so relaunching the app mid-shift showed
  // "ยังไม่เริ่มเวร" even while genuinely on duty. New endpoint:
  // GET /guard-shifts/me/current — GUARD-only, always scoped to the
  // caller's own guardUserId.
  describe("GET /guard-shifts/me/current (QA fix — guard shift state sync)", () => {
    it("a resident and an admin cannot call this guard-only endpoint (403)", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const residentRes = await api(
        baseUrl,
        "GET",
        "/guard-shifts/me/current",
        {
          token: residentAToken,
        },
      );
      expect(residentRes.status).toBe(403);

      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const adminRes = await api(baseUrl, "GET", "/guard-shifts/me/current", {
        token: adminAToken,
      });
      expect(adminRes.status).toBe(403);
    });

    it("returns null with no open shift, the guard's own shift once started, then null again after ending it", async () => {
      const freshGuard = await withVillageContext(villageA.villageId, (tx) =>
        tx.user.create({
          data: {
            villageId: villageA.villageId,
            name: "Fresh Guard A",
            phone: nextPhone("94"),
            role: "GUARD",
          },
        }),
      );
      const guardToken = await loginToken(
        baseUrl,
        freshGuard.phone,
        villageA.villageId,
      );

      const before = await api(baseUrl, "GET", "/guard-shifts/me/current", {
        token: guardToken,
      });
      expect(before.status).toBe(200);
      expect(before.body.shift).toBeNull();

      const startRes = await api(baseUrl, "POST", "/guard-shifts", {
        token: guardToken,
        body: {},
      });
      expect(startRes.status).toBe(201);

      const during = await api(baseUrl, "GET", "/guard-shifts/me/current", {
        token: guardToken,
      });
      expect(during.status).toBe(200);
      expect(during.body.shift.id).toBe(startRes.body.id);
      expect(during.body.shift.status).toBe("ON_DUTY");

      const endRes = await api(
        baseUrl,
        "PATCH",
        `/guard-shifts/${startRes.body.id}`,
        { token: guardToken },
      );
      expect(endRes.status).toBe(200);

      const after = await api(baseUrl, "GET", "/guard-shifts/me/current", {
        token: guardToken,
      });
      expect(after.status).toBe(200);
      expect(after.body.shift).toBeNull();
    });

    it("a guard never sees another guard's open shift — self-scoped, not merely village-scoped", async () => {
      const guardX = await withVillageContext(villageA.villageId, (tx) =>
        tx.user.create({
          data: {
            villageId: villageA.villageId,
            name: "Guard X",
            phone: nextPhone("94"),
            role: "GUARD",
          },
        }),
      );
      const guardY = await withVillageContext(villageA.villageId, (tx) =>
        tx.user.create({
          data: {
            villageId: villageA.villageId,
            name: "Guard Y",
            phone: nextPhone("94"),
            role: "GUARD",
          },
        }),
      );
      const tokenX = await loginToken(
        baseUrl,
        guardX.phone,
        villageA.villageId,
      );
      const tokenY = await loginToken(
        baseUrl,
        guardY.phone,
        villageA.villageId,
      );

      const startX = await api(baseUrl, "POST", "/guard-shifts", {
        token: tokenX,
        body: {},
      });
      expect(startX.status).toBe(201);

      const currentY = await api(baseUrl, "GET", "/guard-shifts/me/current", {
        token: tokenY,
      });
      expect(currentY.status).toBe(200);
      expect(currentY.body.shift).toBeNull();

      // Cleanup so this open shift doesn't affect any other test in this file.
      await api(baseUrl, "PATCH", `/guard-shifts/${startX.body.id}`, {
        token: tokenX,
      });
    });
  });

  // Mobile Dev-agent round QA fix: ExitConfirmScreen was filtering "not yet
  // exited" client-side over a single pageSize=100 page, which would
  // silently drop open visitors past the 100th. New `exited=`
  // query param on the existing GET /entry-logs pushes the
  // `exit_time IS NULL` / `IS NOT NULL` filter into the DB query.
  describe("GET /entry-logs?exited= filter (QA fix — server-side open/closed filter)", () => {
    it("exited=false returns only still-open entries; exited=true returns only closed ones", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const guardAToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );

      const openPass = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("ExitedFilterOpenGuest"),
      });
      const openEntry = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken: openPass.body.qrToken },
      });
      const openId = openEntry.body.entryLog.id;

      const closedPass = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("ExitedFilterClosedGuest"),
      });
      const closedEntry = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken: closedPass.body.qrToken },
      });
      const closedId = closedEntry.body.entryLog.id;
      const confirmRes = await api(
        baseUrl,
        "PATCH",
        `/entry-logs/${closedId}/confirm-exit`,
        { token: guardAToken },
      );
      expect(confirmRes.status).toBe(200);

      const openList = await api(
        baseUrl,
        "GET",
        "/entry-logs?exited=false&pageSize=100",
        { token: guardAToken },
      );
      expect(openList.status).toBe(200);
      expect(openList.body.items.some((i: any) => i.id === openId)).toBe(true);
      expect(openList.body.items.some((i: any) => i.id === closedId)).toBe(
        false,
      );
      expect(openList.body.items.every((i: any) => i.exitTime === null)).toBe(
        true,
      );

      const closedList = await api(
        baseUrl,
        "GET",
        "/entry-logs?exited=true&pageSize=100",
        { token: guardAToken },
      );
      expect(closedList.status).toBe(200);
      expect(closedList.body.items.some((i: any) => i.id === closedId)).toBe(
        true,
      );
      expect(closedList.body.items.some((i: any) => i.id === openId)).toBe(
        false,
      );
      expect(closedList.body.items.every((i: any) => i.exitTime !== null)).toBe(
        true,
      );
    });

    it("the exited filter does not weaken cross-village isolation", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const guardAToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const pass = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("ExitedFilterCrossVillageGuest"),
      });
      const entry = await api(baseUrl, "POST", "/entry-logs", {
        token: guardAToken,
        body: { qrToken: pass.body.qrToken },
      });
      expect(entry.status).toBe(201);

      const adminBToken = await loginToken(
        baseUrl,
        villageB.admin.phone,
        villageB.villageId,
      );
      const listRes = await api(baseUrl, "GET", "/entry-logs?exited=false", {
        token: adminBToken,
      });
      expect(listRes.status).toBe(200);
      expect(
        listRes.body.items.some((i: any) => i.id === entry.body.entryLog.id),
      ).toBe(false);
    });
  });

  describe("Audit log (spec 3.4: admin access to sensitive data is logged)", () => {
    it("admin revoking another user's pass writes an audit_logs row; the owner revoking their own does not", async () => {
      const residentAToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const adminAToken = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );

      const passRes = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("AuditedGuest"),
      });
      const revokeRes = await api(
        baseUrl,
        "PATCH",
        `/visitor-passes/${passRes.body.id}/revoke`,
        {
          token: adminAToken,
        },
      );
      expect(revokeRes.status).toBe(200);

      const logs = await withVillageContext(villageA.villageId, (tx) =>
        tx.auditLog.findMany({
          where: {
            resourceId: passRes.body.id,
            action: "REVOKE_VISITOR_PASS_OTHER_USER",
          },
        }),
      );
      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBe(villageA.admin.id);
      expect(logs[0].resourceType).toBe("visitor_pass");

      // Self-revoke should NOT produce this audit action (see
      // visitor-pass.service.ts: `if (isAdmin && !isOwner)`).
      const passRes2 = await api(baseUrl, "POST", "/visitor-passes", {
        token: residentAToken,
        body: passBody("SelfRevokeGuest"),
      });
      const selfRevokeRes = await api(
        baseUrl,
        "PATCH",
        `/visitor-passes/${passRes2.body.id}/revoke`,
        {
          token: residentAToken,
        },
      );
      expect(selfRevokeRes.status).toBe(200);

      const logs2 = await withVillageContext(villageA.villageId, (tx) =>
        tx.auditLog.findMany({ where: { resourceId: passRes2.body.id } }),
      );
      expect(logs2).toHaveLength(0);
    });
  });

  describe("Multi-village phone number (documented Dev gap: returns 409, does not silently pick a village)", () => {
    it("login without villageId returns 409 with the candidate villages when the phone exists in more than one", async () => {
      const sharedPhone = nextPhone("99");
      await withVillageContext(villageA.villageId, (tx) =>
        tx.user.create({
          data: {
            villageId: villageA.villageId,
            name: "Shared A",
            phone: sharedPhone,
            role: "RESIDENT",
          },
        }),
      );
      await withVillageContext(villageB.villageId, (tx) =>
        tx.user.create({
          data: {
            villageId: villageB.villageId,
            name: "Shared B",
            phone: sharedPhone,
            role: "RESIDENT",
          },
        }),
      );

      const ambiguous = await loginAs(baseUrl, sharedPhone);
      expect(ambiguous.status).toBe(409);
      expect(ambiguous.body.villages).toHaveLength(2);

      const disambiguated = await loginAs(
        baseUrl,
        sharedPhone,
        villageA.villageId,
      );
      expect(disambiguated.status).toBe(201);
      expect(disambiguated.body.user.villageId).toBe(villageA.villageId);
    });
  });
});
