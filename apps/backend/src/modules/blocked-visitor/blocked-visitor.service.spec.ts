import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { BlockedVisitorService } from "./blocked-visitor.service";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";

jest.mock("../../common/rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
}));

function mockClaims(overrides: Partial<TenantClaims> = {}): TenantClaims {
  return {
    userId: "admin-1",
    villageId: "village-1",
    role: "ADMIN",
    houseId: null,
    ...overrides,
  };
}

describe("BlockedVisitorService", () => {
  let service: BlockedVisitorService;
  let tx: {
    blockedVisitor: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    service = new BlockedVisitorService();
    tx = {
      blockedVisitor: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("create", () => {
    it("edge case: rejects an entry with neither phone nor vehiclePlate", async () => {
      await expect(
        service.create({ reason: "no contact info" } as any, mockClaims()),
      ).rejects.toThrow(BadRequestException);
      expect(tx.blockedVisitor.create).not.toHaveBeenCalled();
    });

    it("happy path: phone-only entry is created scoped to the caller's village", async () => {
      const created = { id: "blk-1", phone: "0899999999" };
      tx.blockedVisitor.create.mockResolvedValue(created);

      const result = await service.create(
        { phone: "0899999999", reason: "harassed a resident" } as any,
        mockClaims(),
      );

      expect(result).toBe(created);
      expect(tx.blockedVisitor.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          villageId: "village-1",
          phone: "0899999999",
          createdByUserId: "admin-1",
        }),
      });
    });
  });

  describe("assertNotBlocked", () => {
    it("happy path: no-op when neither phone nor plate is provided", async () => {
      await service.assertNotBlocked({});
      expect(tx.blockedVisitor.findFirst).not.toHaveBeenCalled();
    });

    it("happy path: passes silently when nothing matches", async () => {
      tx.blockedVisitor.findFirst.mockResolvedValue(null);
      await expect(
        service.assertNotBlocked({ phone: "0811111111" }),
      ).resolves.toBeUndefined();
    });

    it("edge case: a matching phone throws ForbiddenException with the reason", async () => {
      tx.blockedVisitor.findFirst.mockResolvedValue({
        id: "blk-1",
        phone: "0899999999",
        reason: "harassed a resident",
      });

      await expect(
        service.assertNotBlocked({ phone: "0899999999" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("edge case: a matching vehicle plate throws even with no phone given", async () => {
      tx.blockedVisitor.findFirst.mockResolvedValue({
        id: "blk-2",
        vehiclePlate: "กข1234",
        reason: null,
      });

      await expect(
        service.assertNotBlocked({ vehiclePlate: "กข1234" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("edge case: checks both phone and plate in a single OR query", async () => {
      tx.blockedVisitor.findFirst.mockResolvedValue(null);

      await service.assertNotBlocked({
        phone: "0811111111",
        vehiclePlate: "กข1234",
      });

      expect(tx.blockedVisitor.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ phone: "0811111111" }, { vehiclePlate: "กข1234" }],
        },
      });
    });
  });
});
