import { BadRequestException } from "@nestjs/common";
import { PushTokenService } from "./push-token.service";
import { getTenantPrismaClient } from "../rls/tenant-context";
import type { TenantClaims } from "../rls/tenant-context";
import { runInTenantTransaction } from "../rls/tenant-transaction";

jest.mock("../rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
}));

// Bug fix regression guard: `listTokensForUsers`/`removeTokenByValue` used to
// query through the raw `PrismaService` on the (wrong) theory that it
// bypasses RLS — it doesn't, and every real push trigger silently found
// zero tokens as a result (see push-token.service.ts's class doc comment).
// The fix routes both through `runInTenantTransaction()` — mocked here to
// just invoke the callback directly (a real `$transaction` call against a
// fully-mocked PrismaService isn't meaningful in a unit test; the actual
// RLS-scoping behavior of `runInTenantTransaction` itself is covered
// against real Postgres by tenant-transaction's own e2e coverage via
// RlsInterceptor/WsRlsInterceptor's existing tests).
jest.mock("../rls/tenant-transaction", () => ({
  runInTenantTransaction: jest.fn((_prisma, _claims, fn) => fn()),
}));

function mockClaims(overrides: Partial<TenantClaims> = {}): TenantClaims {
  return {
    userId: "user-1",
    villageId: "village-1",
    role: "RESIDENT",
    houseId: "house-1",
    ...overrides,
  };
}

const VALID_TOKEN = "ExponentPushToken[abc123DEF456]";

describe("PushTokenService", () => {
  let service: PushTokenService;
  let prisma: { pushToken: { findMany: jest.Mock; deleteMany: jest.Mock } };
  let tx: {
    pushToken: { upsert: jest.Mock; deleteMany: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      pushToken: { findMany: jest.fn(), deleteMany: jest.fn() },
    };
    service = new PushTokenService(prisma as any);
    tx = {
      pushToken: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    };
    (runInTenantTransaction as jest.Mock).mockImplementation(
      (_prisma, _claims, fn) => fn(),
    );
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("registerToken", () => {
    it("happy path: upserts on the (userId, expoPushToken) unique key", async () => {
      const claims = mockClaims({ userId: "user-9", villageId: "village-9" });
      const row = { id: "pt-1", userId: "user-9", expoPushToken: VALID_TOKEN };
      tx.pushToken.upsert.mockResolvedValue(row);

      const result = await service.registerToken(claims, VALID_TOKEN);

      expect(result).toBe(row);
      expect(tx.pushToken.upsert).toHaveBeenCalledWith({
        where: {
          userId_expoPushToken: {
            userId: "user-9",
            expoPushToken: VALID_TOKEN,
          },
        },
        update: {},
        create: {
          villageId: "village-9",
          userId: "user-9",
          expoPushToken: VALID_TOKEN,
        },
      });
    });

    it("re-registering the identical token upserts (no duplicate row) — same upsert call shape", async () => {
      const claims = mockClaims();
      tx.pushToken.upsert.mockResolvedValue({ id: "pt-1" });

      await service.registerToken(claims, VALID_TOKEN);
      await service.registerToken(claims, VALID_TOKEN);

      expect(tx.pushToken.upsert).toHaveBeenCalledTimes(2);
      expect(tx.pushToken.upsert.mock.calls[0]).toEqual(
        tx.pushToken.upsert.mock.calls[1],
      );
    });

    it("edge case: rejects a value that isn't a well-formed Expo push token", async () => {
      const claims = mockClaims();

      await expect(
        service.registerToken(claims, "not-a-real-token"),
      ).rejects.toThrow(BadRequestException);
      expect(tx.pushToken.upsert).not.toHaveBeenCalled();
    });
  });

  describe("removeToken", () => {
    it("only ever deletes the CALLER's own token (userId from claims, not the DTO)", async () => {
      const claims = mockClaims({ userId: "user-9" });
      tx.pushToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeToken(claims, VALID_TOKEN);

      expect(tx.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-9", expoPushToken: VALID_TOKEN },
      });
    });
  });

  describe("listTokensForUsers", () => {
    it("returns [] without querying when userIds is empty (no wide-open findMany)", async () => {
      const claims = mockClaims();
      const result = await service.listTokensForUsers([], claims);

      expect(result).toEqual([]);
      expect(tx.pushToken.findMany).not.toHaveBeenCalled();
      expect(runInTenantTransaction).not.toHaveBeenCalled();
    });

    it("batch-looks-up tokens for multiple users through runInTenantTransaction (RLS-scoped), not the raw PrismaClient", async () => {
      const claims = mockClaims({ villageId: "village-9" });
      const rows = [
        { userId: "u1", expoPushToken: "t1" },
        { userId: "u2", expoPushToken: "t2" },
      ];
      tx.pushToken.findMany.mockResolvedValue(rows);

      const result = await service.listTokensForUsers(["u1", "u2"], claims);

      expect(result).toBe(rows);
      expect(tx.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: { in: ["u1", "u2"] } },
        select: { userId: true, expoPushToken: true },
      });
      // The regression this guards against: a raw `prisma.pushToken.findMany`
      // call outside any tenant-scoped transaction silently returns zero
      // rows against real RLS-forced Postgres — see the class doc comment.
      expect(prisma.pushToken.findMany).not.toHaveBeenCalled();
      expect(runInTenantTransaction).toHaveBeenCalledWith(
        prisma,
        claims,
        expect.any(Function),
      );
    });
  });

  describe("removeTokenByValue", () => {
    it("deletes by token value alone, regardless of which user(s) hold it — RLS-scoped via runInTenantTransaction", async () => {
      const claims = mockClaims();
      tx.pushToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.removeTokenByValue(VALID_TOKEN, claims);

      expect(tx.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { expoPushToken: VALID_TOKEN },
      });
      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
    });

    it("swallows errors rather than throwing (called from a fire-and-forget path)", async () => {
      const claims = mockClaims();
      (runInTenantTransaction as jest.Mock).mockRejectedValueOnce(
        new Error("db down"),
      );

      await expect(
        service.removeTokenByValue(VALID_TOKEN, claims),
      ).resolves.toBeUndefined();
    });
  });
});
