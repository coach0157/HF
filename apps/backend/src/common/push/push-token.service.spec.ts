import { BadRequestException } from "@nestjs/common";
import { PushTokenService } from "./push-token.service";
import { getTenantPrismaClient } from "../rls/tenant-context";
import type { TenantClaims } from "../rls/tenant-context";

jest.mock("../rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
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
  let tx: { pushToken: { upsert: jest.Mock; deleteMany: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      pushToken: { findMany: jest.fn(), deleteMany: jest.fn() },
    };
    service = new PushTokenService(prisma as any);
    tx = {
      pushToken: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
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
      const result = await service.listTokensForUsers([]);

      expect(result).toEqual([]);
      expect(prisma.pushToken.findMany).not.toHaveBeenCalled();
    });

    it("batch-looks-up tokens for multiple users via the raw PrismaClient, not the RLS tx", async () => {
      const rows = [
        { userId: "u1", expoPushToken: "t1" },
        { userId: "u2", expoPushToken: "t2" },
      ];
      prisma.pushToken.findMany.mockResolvedValue(rows);

      const result = await service.listTokensForUsers(["u1", "u2"]);

      expect(result).toBe(rows);
      expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: { in: ["u1", "u2"] } },
        select: { userId: true, expoPushToken: true },
      });
      expect(getTenantPrismaClient).not.toHaveBeenCalled();
    });
  });

  describe("removeTokenByValue", () => {
    it("deletes by token value alone, regardless of which user(s) hold it", async () => {
      prisma.pushToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.removeTokenByValue(VALID_TOKEN);

      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { expoPushToken: VALID_TOKEN },
      });
    });

    it("swallows errors rather than throwing (called from a fire-and-forget path)", async () => {
      prisma.pushToken.deleteMany.mockRejectedValue(new Error("db down"));

      await expect(
        service.removeTokenByValue(VALID_TOKEN),
      ).resolves.toBeUndefined();
    });
  });
});
