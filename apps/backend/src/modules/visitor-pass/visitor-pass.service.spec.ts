import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { VisitorPassStatus } from "@prisma/client";
import { VisitorPassService } from "./visitor-pass.service";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";

jest.mock("../../common/rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
}));

function mockClaims(overrides: Partial<TenantClaims> = {}): TenantClaims {
  return {
    userId: "resident-1",
    villageId: "village-1",
    role: "RESIDENT",
    houseId: "house-1",
    ...overrides,
  };
}

describe("VisitorPassService", () => {
  let service: VisitorPassService;
  let qrToken: { sign: jest.Mock; verify: jest.Mock };
  let auditService: { log: jest.Mock };
  let tx: {
    visitorPass: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    user: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    qrToken = {
      sign: jest.fn().mockReturnValue("signed-qr-token"),
      verify: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new VisitorPassService(qrToken as any, auditService as any);
    tx = {
      visitorPass: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("create", () => {
    it("happy path: creates a pass with a signed QR token for a valid time window", async () => {
      const claims = mockClaims();
      const created = { id: "pass-1", status: VisitorPassStatus.UNUSED };
      tx.visitorPass.create.mockResolvedValue(created);

      const result = await service.create(
        {
          visitorName: "Somchai",
          validFrom: new Date(Date.now() + 60_000).toISOString(),
          validTo: new Date(Date.now() + 3_600_000).toISOString(),
          usageType: "SINGLE",
        } as any,
        claims,
      );

      expect(result).toBe(created);
      expect(qrToken.sign).toHaveBeenCalled();
      expect(tx.visitorPass.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          villageId: "village-1",
          visitorName: "Somchai",
          qrToken: "signed-qr-token",
        }),
      });
    });

    it("edge case: validTo must be after validFrom", async () => {
      const claims = mockClaims();
      const now = Date.now();

      await expect(
        service.create(
          {
            visitorName: "Somchai",
            validFrom: new Date(now + 3_600_000).toISOString(),
            validTo: new Date(now + 60_000).toISOString(),
            usageType: "SINGLE",
          } as any,
          claims,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.visitorPass.create).not.toHaveBeenCalled();
    });
  });

  describe("resolveForScan — QR revoke must block the scan", () => {
    it("edge case: a revoked pass is rejected even though validTo has not passed", async () => {
      const claims = mockClaims({ role: "GUARD", houseId: null });
      qrToken.verify.mockReturnValue({
        passId: "pass-1",
        villageId: "village-1",
      });
      tx.visitorPass.findUnique.mockResolvedValue({
        id: "pass-1",
        qrToken: "tok",
        status: VisitorPassStatus.REVOKED,
        validTo: new Date(Date.now() + 3_600_000),
        validFrom: new Date(Date.now() - 3_600_000),
      });

      await expect(service.resolveForScan("tok", claims)).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.visitorPass.update).not.toHaveBeenCalled();
    });

    it("happy path: a valid, currently-open pass resolves successfully", async () => {
      const claims = mockClaims({ role: "GUARD", houseId: null });
      qrToken.verify.mockReturnValue({
        passId: "pass-1",
        villageId: "village-1",
      });
      const pass = {
        id: "pass-1",
        qrToken: "tok",
        status: VisitorPassStatus.UNUSED,
        validTo: new Date(Date.now() + 3_600_000),
        validFrom: new Date(Date.now() - 3_600_000),
      };
      tx.visitorPass.findUnique.mockResolvedValue(pass);

      const result = await service.resolveForScan("tok", claims);

      expect(result).toBe(pass);
    });

    it("edge case: an invalid/malformed QR token is rejected", async () => {
      const claims = mockClaims({ role: "GUARD" });
      qrToken.verify.mockImplementation(() => {
        throw new Error("bad signature");
      });

      await expect(service.resolveForScan("garbage", claims)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("revoke", () => {
    it("audit log fires only when an admin revokes someone else's pass", async () => {
      const claims = mockClaims({ role: "ADMIN", userId: "admin-1" });
      tx.visitorPass.findUnique.mockResolvedValue({
        id: "pass-1",
        createdByUserId: "resident-1",
        status: VisitorPassStatus.UNUSED,
      });
      tx.visitorPass.update.mockResolvedValue({
        id: "pass-1",
        status: VisitorPassStatus.REVOKED,
      });

      await service.revoke("pass-1", claims);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REVOKE_VISITOR_PASS_OTHER_USER" }),
      );
    });

    it("edge case: revoking an already-revoked pass is idempotent (no double update, no audit log)", async () => {
      const claims = mockClaims({ role: "ADMIN", userId: "admin-1" });
      const alreadyRevoked = {
        id: "pass-1",
        createdByUserId: "resident-1",
        status: VisitorPassStatus.REVOKED,
      };
      tx.visitorPass.findUnique.mockResolvedValue(alreadyRevoked);

      const result = await service.revoke("pass-1", claims);

      expect(result).toBe(alreadyRevoked);
      expect(tx.visitorPass.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe("markEntered", () => {
    it("edge case: a completed SINGLE-use pass cannot be re-entered", async () => {
      tx.visitorPass.findUniqueOrThrow.mockResolvedValue({
        id: "pass-1",
        status: VisitorPassStatus.EXITED,
        usageType: "SINGLE",
      });

      await expect(service.markEntered("pass-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("happy path: a MULTI-use pass can re-enter after exiting", async () => {
      tx.visitorPass.findUniqueOrThrow.mockResolvedValue({
        id: "pass-1",
        status: VisitorPassStatus.EXITED,
        usageType: "MULTI",
      });
      const updated = { id: "pass-1", status: VisitorPassStatus.ENTERED };
      tx.visitorPass.update.mockResolvedValue(updated);

      const result = await service.markEntered("pass-1");

      expect(result).toBe(updated);
    });
  });
});
