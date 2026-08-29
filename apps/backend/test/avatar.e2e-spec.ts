/**
 * e2e coverage for the avatar upload feature (Dev-agent addition, requested
 * outside the original spec — see users.controller.ts/users.service.ts's
 * `updateAvatar`/`me` doc comments). Pattern mirrors
 * test/maintenance.e2e-spec.ts: RBAC + validation against the real HTTP
 * surface, with a real village/user fixture per test scenario.
 *
 * Unlike the other e2e spec files, this one boots the test app as a
 * NestExpressApplication with the same `useBodyParser('json', { limit: ... })`
 * override as src/main.ts — the default Express JSON body limit (100kb) is
 * too small for a base64 photo, and without this override every oversized-
 * image test below would hit Express's 413 instead of the intended 400 from
 * UsersService.updateAvatar()'s own size check.
 */
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { CanActivate } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
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

// A tiny base64 payload that satisfies FileStorageService's
// `data:image/...;base64,...` regex — the bytes are written verbatim to
// local disk, never decoded as a real image, so content doesn't matter.
const SMALL_AVATAR = "data:image/jpeg;base64," + Buffer.from("tiny-fake-jpeg-bytes").toString("base64");

describe("Avatar upload (Users module) — API-driven e2e", () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let villageA: VillageFixture;
  let villageB: VillageFixture;

  beforeAll(async () => {
    (ThrottlerGuard.prototype as unknown as CanActivate).canActivate =
      async () => true;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Mirror src/main.ts's real body-size override (see file doc comment).
    app.useBodyParser("json", { limit: "8mb" });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    villageA = await createVillageFixture("AVT-A", "85");
    villageB = await createVillageFixture("AVT-B", "86");
  }, 60_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
    await app.close();
  });

  function uploadAvatar(token: string, photoDataUrl: string) {
    return api(baseUrl, "PATCH", "/users/me/avatar", {
      token,
      body: { photoDataUrl },
    });
  }

  describe("PATCH /users/me/avatar — RBAC", () => {
    it("resident can upload their own avatar", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await uploadAvatar(token, SMALL_AVATAR);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(villageA.resident.id);
      expect(typeof res.body.avatarUrl).toBe("string");
      expect(res.body.avatarUrl).toContain("village-avatars");
    });

    it("guard can upload their own avatar", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.guardOnDuty.phone,
        villageA.villageId,
      );
      const res = await uploadAvatar(token, SMALL_AVATAR);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(villageA.guardOnDuty.id);
    });

    it("admin can upload their own avatar", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.admin.phone,
        villageA.villageId,
      );
      const res = await uploadAvatar(token, SMALL_AVATAR);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(villageA.admin.id);
    });

    it("unauthenticated request is rejected with 401", async () => {
      const res = await uploadAvatar("", SMALL_AVATAR);
      expect(res.status).toBe(401);
    });

    it("only ever updates the caller's own row — never another user's, even in the same village", async () => {
      const residentToken = await loginToken(
        baseUrl,
        villageB.resident.phone,
        villageB.villageId,
      );
      await uploadAvatar(residentToken, SMALL_AVATAR);

      const guardRow = await withVillageContext(villageB.villageId, (tx) =>
        tx.user.findUnique({ where: { id: villageB.guardOnDuty.id } }),
      );
      expect(guardRow?.avatarUrl).toBeNull();
    });
  });

  describe("PATCH /users/me/avatar — validation", () => {
    it("rejects a non-data-URL string with 400", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await uploadAvatar(token, "https://example.com/pic.jpg");
      expect(res.status).toBe(400);
    });

    it("rejects an unsupported image mime type with 400", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await uploadAvatar(
        token,
        "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
      );
      expect(res.status).toBe(400);
    });

    it("rejects an oversized image with 400 (over the 3MB avatar cap)", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const oversized =
        "data:image/jpeg;base64," + "A".repeat(5 * 1024 * 1024);
      const res = await uploadAvatar(token, oversized);
      expect(res.status).toBe(400);
    });

    it("missing photoDataUrl is rejected with 400", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.resident.phone,
        villageA.villageId,
      );
      const res = await api(baseUrl, "PATCH", "/users/me/avatar", {
        token,
        body: {},
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /users/me — includes avatarUrl", () => {
    it("reflects the newly uploaded avatar", async () => {
      const token = await loginToken(
        baseUrl,
        villageA.guardOffDuty.phone,
        villageA.villageId,
      );
      const before = await api(baseUrl, "GET", "/users/me", { token });
      expect(before.status).toBe(200);
      expect(before.body.avatarUrl).toBeNull();

      const upload = await uploadAvatar(token, SMALL_AVATAR);
      expect(upload.status).toBe(200);

      const after = await api(baseUrl, "GET", "/users/me", { token });
      expect(after.status).toBe(200);
      expect(after.body.avatarUrl).toBe(upload.body.avatarUrl);
      expect(after.body.id).toBe(villageA.guardOffDuty.id);
      expect(after.body.name).toBe(`GuardOffDuty AVT-A`);
    });
  });
});
