/**
 * e2e coverage for Epic 11 — Push Notifications (docs/ARCHITECTURE.md
 * ADR-006 / PHASE2_BACKLOG.md Epic 11): `POST /push-tokens` (register,
 * called by the mobile client right after login/session-restore) and
 * `DELETE /push-tokens` (unregister, called at logout). Pattern mirrors
 * test/transport-provider.e2e-spec.ts.
 *
 * Deliberately does NOT test `PushNotificationService.send()`'s Expo
 * network call here (no real Expo push token / network dependency in CI) —
 * that's covered by src/common/push/push-notification.service.spec.ts
 * (mocked Expo SDK) and the per-trigger *.service.spec.ts files (routing +
 * deep-link data schema assertions against a mocked PushNotificationService).
 * This file only exercises the actual HTTP surface: RBAC, upsert semantics,
 * cross-tenant isolation, and that a caller can only ever register/remove
 * their OWN token.
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

const TOKEN_A = "ExponentPushToken[e2e-test-token-aaaaaaaa]";
const TOKEN_B = "ExponentPushToken[e2e-test-token-bbbbbbbb]";

describe("Push Tokens (Epic 11) — API-driven e2e", () => {
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

    villageA = await createVillageFixture("PSH-A", "83");
    villageB = await createVillageFixture("PSH-B", "84");
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  describe("POST /push-tokens — RBAC + upsert semantics", () => {
    it("resident can register a token", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/push-tokens", {
        token,
        body: { expoPushToken: TOKEN_A },
      });
      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(villageA.resident.id);
      expect(res.body.expoPushToken).toBe(TOKEN_A);
      expect(res.body.villageId).toBe(villageA.villageId);
    });

    it("guard can register a token", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/push-tokens", {
        token,
        body: { expoPushToken: TOKEN_B },
      });
      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(villageA.guardOnDuty.id);
    });

    it("admin can register a token", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/push-tokens", {
        token,
        body: { expoPushToken: "ExponentPushToken[e2e-admin-token]" },
      });
      expect(res.status).toBe(201);
    });

    it("re-registering the SAME token for the SAME user upserts — no duplicate row", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const distinctToken = "ExponentPushToken[e2e-upsert-test]";

      const first = await api(baseUrl, "POST", "/push-tokens", {
        token,
        body: { expoPushToken: distinctToken },
      });
      const second = await api(baseUrl, "POST", "/push-tokens", {
        token,
        body: { expoPushToken: distinctToken },
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.id).toBe(second.body.id);

      const rows = await withVillageContext(villageA.villageId, (tx) =>
        tx.pushToken.findMany({
          where: {
            userId: villageA.resident.id,
            expoPushToken: distinctToken,
          },
        }),
      );
      expect(rows.length).toBe(1);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await api(baseUrl, "POST", "/push-tokens", {
        body: { expoPushToken: TOKEN_A },
      });
      expect(res.status).toBe(401);
    });

    it("malformed token value is rejected with 400", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/push-tokens", {
        token,
        body: { expoPushToken: "not-a-real-expo-token" },
      });
      expect(res.status).toBe(400);
    });

    it("missing expoPushToken is rejected with 400", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "POST", "/push-tokens", {
        token,
        body: {},
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /push-tokens — only removes the caller's own token", () => {
    it("resident can remove their own registered token", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const removeToken = "ExponentPushToken[e2e-remove-test]";
      await api(baseUrl, "POST", "/push-tokens", {
        token,
        body: { expoPushToken: removeToken },
      });

      const res = await api(baseUrl, "DELETE", "/push-tokens", {
        token,
        body: { expoPushToken: removeToken },
      });
      expect(res.status).toBe(204);

      const rows = await withVillageContext(villageA.villageId, (tx) =>
        tx.pushToken.findMany({
          where: { userId: villageA.resident.id, expoPushToken: removeToken },
        }),
      );
      expect(rows.length).toBe(0);
    });

    it("removing a token that was never registered is a no-op 204, not an error", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "DELETE", "/push-tokens", {
        token,
        body: { expoPushToken: "ExponentPushToken[never-registered]" },
      });
      expect(res.status).toBe(204);
    });

    it("cannot remove another user's token even by supplying the same token value cross-account", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const guardToken = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const sharedValueToken = "ExponentPushToken[e2e-cross-account]";

      await api(baseUrl, "POST", "/push-tokens", {
        token: residentToken,
        body: { expoPushToken: sharedValueToken },
      });

      // The guard "removing" the exact same token string only ever deletes
      // rows WHERE userId = guard's own id — the resident's row must survive.
      const res = await api(baseUrl, "DELETE", "/push-tokens", {
        token: guardToken,
        body: { expoPushToken: sharedValueToken },
      });
      expect(res.status).toBe(204);

      const residentRows = await withVillageContext(
        villageA.villageId,
        (tx) =>
          tx.pushToken.findMany({
            where: {
              userId: villageA.resident.id,
              expoPushToken: sharedValueToken,
            },
          }),
      );
      expect(residentRows.length).toBe(1);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await api(baseUrl, "DELETE", "/push-tokens", {
        body: { expoPushToken: TOKEN_A },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("cross-tenant isolation", () => {
    it("village B's registration never shows up under village A's user", async () => {
      const tokenB = await loginToken(
        baseUrl,
        villageB.resident.phone,
        villageB.villageId,
      );
      const villageBToken = "ExponentPushToken[e2e-village-b]";
      const res = await api(baseUrl, "POST", "/push-tokens", {
        token: tokenB,
        body: { expoPushToken: villageBToken },
      });
      expect(res.status).toBe(201);
      expect(res.body.villageId).toBe(villageB.villageId);

      // Query FROM village A's own RLS context, for the token value alone
      // (no userId filter) — RLS must hide village B's row even though the
      // raw table has no other reason to exclude it.
      const rows = await withVillageContext(villageA.villageId, (tx) =>
        tx.pushToken.findMany({ where: { expoPushToken: villageBToken } }),
      );
      expect(rows.length).toBe(0);
    });
  });
});
