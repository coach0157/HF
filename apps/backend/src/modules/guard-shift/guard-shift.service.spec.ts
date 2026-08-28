import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { GuardShiftStatus } from "@prisma/client";
import { GuardShiftService } from "./guard-shift.service";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";

// The service never injects PrismaService directly (see
// docs/ARCHITECTURE.md §2) — it always calls getTenantPrismaClient(), so
// unit-testing it means mocking that one function and handing back a fake
// transactional client with jest.fn() model methods.
jest.mock("../../common/rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
}));

function mockClaims(overrides: Partial<TenantClaims> = {}): TenantClaims {
  return {
    userId: "guard-1",
    villageId: "village-1",
    role: "GUARD",
    houseId: null,
    ...overrides,
  };
}

describe("GuardShiftService", () => {
  let service: GuardShiftService;
  let tx: {
    user: { findUnique: jest.Mock };
    guardShift: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    service = new GuardShiftService();
    tx = {
      user: { findUnique: jest.fn() },
      guardShift: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("start", () => {
    it("happy path: a guard starts their own shift", async () => {
      const claims = mockClaims();
      tx.user.findUnique.mockResolvedValue({ id: "guard-1", role: "GUARD" });
      tx.guardShift.findFirst.mockResolvedValue(null);
      const created = {
        id: "shift-1",
        guardUserId: "guard-1",
        status: GuardShiftStatus.ON_DUTY,
      };
      tx.guardShift.create.mockResolvedValue(created);

      const result = await service.start({}, claims);

      expect(result).toBe(created);
      expect(tx.guardShift.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          villageId: "village-1",
          guardUserId: "guard-1",
          status: GuardShiftStatus.ON_DUTY,
        }),
      });
    });

    it("edge case: refuses to start a shift when one is already open", async () => {
      const claims = mockClaims();
      tx.user.findUnique.mockResolvedValue({ id: "guard-1", role: "GUARD" });
      tx.guardShift.findFirst.mockResolvedValue({ id: "existing-open-shift" });

      await expect(service.start({}, claims)).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.guardShift.create).not.toHaveBeenCalled();
    });

    it("edge case: a non-admin guard cannot start another guard's shift", async () => {
      const claims = mockClaims({ userId: "guard-1", role: "GUARD" });

      await expect(
        service.start({ guardUserId: "some-other-guard" }, claims),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.user.findUnique).not.toHaveBeenCalled();
    });

    it("edge case: guardUserId must reference an actual GUARD user", async () => {
      const claims = mockClaims({ role: "ADMIN", userId: "admin-1" });
      tx.user.findUnique.mockResolvedValue({
        id: "resident-1",
        role: "RESIDENT",
      });

      await expect(
        service.start({ guardUserId: "resident-1" }, claims),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("end", () => {
    it("happy path: a guard ends their own open shift", async () => {
      const claims = mockClaims();
      tx.guardShift.findUnique.mockResolvedValue({
        id: "shift-1",
        guardUserId: "guard-1",
        status: GuardShiftStatus.ON_DUTY,
      });
      const updated = { id: "shift-1", status: GuardShiftStatus.OFF_DUTY };
      tx.guardShift.update.mockResolvedValue(updated);

      const result = await service.end("shift-1", claims);

      expect(result).toBe(updated);
      expect(tx.guardShift.update).toHaveBeenCalledWith({
        where: { id: "shift-1" },
        data: expect.objectContaining({ status: GuardShiftStatus.OFF_DUTY }),
      });
    });

    it("edge case: 404 when the shift does not exist", async () => {
      const claims = mockClaims();
      tx.guardShift.findUnique.mockResolvedValue(null);

      await expect(service.end("missing", claims)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("edge case: a guard cannot end another guard's shift", async () => {
      const claims = mockClaims({ userId: "guard-1", role: "GUARD" });
      tx.guardShift.findUnique.mockResolvedValue({
        id: "shift-1",
        guardUserId: "guard-2",
        status: GuardShiftStatus.ON_DUTY,
      });

      await expect(service.end("shift-1", claims)).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.guardShift.update).not.toHaveBeenCalled();
    });

    it("edge case: ending an already-closed shift is idempotent (no-op update)", async () => {
      const claims = mockClaims();
      const alreadyClosed = {
        id: "shift-1",
        guardUserId: "guard-1",
        status: GuardShiftStatus.OFF_DUTY,
      };
      tx.guardShift.findUnique.mockResolvedValue(alreadyClosed);

      const result = await service.end("shift-1", claims);

      expect(result).toBe(alreadyClosed);
      expect(tx.guardShift.update).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentForGuard — QA fix for mobile shift-state sync", () => {
    it("happy path: returns the caller's own open shift", async () => {
      const claims = mockClaims({ userId: "guard-1" });
      const openShift = {
        id: "shift-1",
        guardUserId: "guard-1",
        status: GuardShiftStatus.ON_DUTY,
        shiftEnd: null,
      };
      tx.guardShift.findFirst.mockResolvedValue(openShift);

      const result = await service.getCurrentForGuard(claims);

      expect(result).toBe(openShift);
      expect(tx.guardShift.findFirst).toHaveBeenCalledWith({
        where: {
          guardUserId: "guard-1",
          status: GuardShiftStatus.ON_DUTY,
          shiftEnd: null,
        },
        orderBy: { shiftStart: "desc" },
      });
    });

    it("edge case: returns null (not an error) when the guard has no open shift", async () => {
      const claims = mockClaims({ userId: "guard-1" });
      tx.guardShift.findFirst.mockResolvedValue(null);

      const result = await service.getCurrentForGuard(claims);

      expect(result).toBeNull();
    });

    it("edge case: always queries by the caller's own userId, never a passed-in one", async () => {
      const claims = mockClaims({ userId: "guard-1" });
      tx.guardShift.findFirst.mockResolvedValue(null);

      await service.getCurrentForGuard(claims);

      const calledWith = tx.guardShift.findFirst.mock.calls[0][0];
      expect(calledWith.where.guardUserId).toBe("guard-1");
    });
  });
});
