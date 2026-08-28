import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";

jest.mock("../../common/rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
}));

// AuthService is unusual: it instantiates its OWN PrismaClient
// (`authLookupPrisma`, the BYPASSRLS auth-lookup role — see the class doc
// comment in auth.service.ts) and its own JwtService (`refreshJwt`) directly
// in its constructor, rather than only receiving them via DI. For a unit
// test we let the constructor run (ConfigService supplies a syntactically
// valid fake Postgres URL and a real JWT secret so construction succeeds
// without ever opening a real connection — Prisma Client is lazy), then
// reach past the constructor and swap `authLookupPrisma` for a full mock.
// `refreshJwt` is left as a REAL JwtService instance: signing/decoding a JWT
// needs no network or DB, so it's simpler and more faithful to let it run
// for real than to mock jsonwebtoken.
function buildService() {
  const config = {
    get: jest.fn((key: string, def?: unknown) => {
      const values: Record<string, string> = {
        JWT_REFRESH_SECRET: "test-refresh-secret",
        AUTH_LOOKUP_DATABASE_URL:
          "postgresql://user:pass@localhost:5432/village_security",
        JWT_REFRESH_EXPIRES_IN: "30d",
      };
      return values[key] ?? def;
    }),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue("fake-access-token"),
  };
  const otpService = { requestOtp: jest.fn(), verifyOtp: jest.fn() };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    village: { findMany: jest.fn() },
  };

  const service = new AuthService(
    prisma as any,
    jwtService as any,
    otpService as any,
    config as any,
  );
  const authLookupPrisma = { user: { findMany: jest.fn() } };
  (service as any).authLookupPrisma = authLookupPrisma;

  return {
    service,
    config,
    jwtService,
    otpService,
    tx,
    prisma,
    authLookupPrisma,
  };
}

describe("AuthService", () => {
  afterEach(() => jest.clearAllMocks());

  describe("login", () => {
    it("happy path: correct OTP + single matching account issues a token pair", async () => {
      const { service, otpService, authLookupPrisma } = buildService();
      otpService.verifyOtp.mockReturnValue(true);
      authLookupPrisma.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          villageId: "village-1",
          phone: "0812345678",
          role: "RESIDENT",
          houseId: "house-1",
          name: "Somchai",
        },
      ]);

      const result = await service.login("0812345678", "000000");

      expect(result.accessToken).toBe("fake-access-token");
      expect(typeof result.refreshToken).toBe("string");
      expect(result.user.id).toBe("user-1");
    });

    it("edge case: an invalid/expired OTP is rejected before any DB lookup runs", async () => {
      const { service, otpService, authLookupPrisma } = buildService();
      otpService.verifyOtp.mockReturnValue(false);

      await expect(service.login("0812345678", "999999")).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authLookupPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it("edge case: no account for this phone number in any village", async () => {
      const { service, otpService, authLookupPrisma } = buildService();
      otpService.verifyOtp.mockReturnValue(true);
      authLookupPrisma.user.findMany.mockResolvedValue([]);

      await expect(service.login("0812345678", "000000")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("edge case (documented multi-village UX, see QA_REPORT.md): a phone registered in 2+ villages without a villageId fails closed with 409, never silently picking one", async () => {
      const { service, otpService, authLookupPrisma, prisma } = buildService();
      otpService.verifyOtp.mockReturnValue(true);
      authLookupPrisma.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          villageId: "village-A",
          phone: "0812345678",
          role: "RESIDENT",
          houseId: null,
          name: "A",
        },
        {
          id: "user-2",
          villageId: "village-B",
          phone: "0812345678",
          role: "RESIDENT",
          houseId: null,
          name: "B",
        },
      ]);
      prisma.village.findMany.mockResolvedValue([
        { id: "village-A", name: "Village A" },
        { id: "village-B", name: "Village B" },
      ]);

      await expect(service.login("0812345678", "000000")).rejects.toThrow(
        ConflictException,
      );
    });

    it("multi-village phone WITH a matching villageId succeeds", async () => {
      const { service, otpService, authLookupPrisma } = buildService();
      otpService.verifyOtp.mockReturnValue(true);
      authLookupPrisma.user.findMany.mockResolvedValue([
        {
          id: "user-1",
          villageId: "village-A",
          phone: "0812345678",
          role: "RESIDENT",
          houseId: null,
          name: "A",
        },
        {
          id: "user-2",
          villageId: "village-B",
          phone: "0812345678",
          role: "RESIDENT",
          houseId: null,
          name: "B",
        },
      ]);

      const result = await service.login("0812345678", "000000", "village-B");

      expect(result.user.id).toBe("user-2");
    });
  });

  describe("logout", () => {
    it("happy path: revokes the presented refresh token by hash", async () => {
      const { service } = buildService();
      const tx = {
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);

      await service.logout("some-refresh-token");

      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });
  });
});
