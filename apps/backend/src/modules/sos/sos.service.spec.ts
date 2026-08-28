import { BadRequestException, NotFoundException } from "@nestjs/common";
import { GuardShiftStatus, SosStatus } from "@prisma/client";
import { SosService } from "./sos.service";
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

describe("SosService", () => {
  let service: SosService;
  let pushNotificationService: { send: jest.Mock };
  let tx: {
    sosAlert: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    guardShift: { findMany: jest.Mock };
  };

  beforeEach(() => {
    pushNotificationService = { send: jest.fn() };
    service = new SosService(pushNotificationService as any);
    tx = {
      sosAlert: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      guardShift: { findMany: jest.fn() },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("trigger", () => {
    it("happy path: routes the alert only to on-duty guards", async () => {
      const claims = mockClaims();
      const alert = { id: "alert-1", status: SosStatus.PENDING };
      tx.sosAlert.create.mockResolvedValue(alert);
      tx.guardShift.findMany.mockResolvedValue([
        { guardUserId: "guard-on-duty-1" },
        { guardUserId: "guard-on-duty-2" },
      ]);

      const result = await service.trigger(
        { latitude: 13.7, longitude: 100.5 },
        claims,
      );

      expect(result.alert).toBe(alert);
      expect(result.routedToGuardUserIds).toEqual([
        "guard-on-duty-1",
        "guard-on-duty-2",
      ]);

      // Epic 11 (ADR-006): push is fire-and-forget — sent with exactly the
      // routing result, never awaited by trigger().
      expect(pushNotificationService.send).toHaveBeenCalledWith(
        ["guard-on-duty-1", "guard-on-duty-2"],
        expect.objectContaining({
          data: { type: "sos", id: "alert-1" },
        }),
      );
    });

    it("Epic 11 (ADR-006): does not call push when no guard is on duty", async () => {
      const claims = mockClaims();
      tx.sosAlert.create.mockResolvedValue({ id: "alert-1" });
      tx.guardShift.findMany.mockResolvedValue([]);

      await service.trigger({}, claims);

      expect(pushNotificationService.send).toHaveBeenCalledWith(
        [],
        expect.anything(),
      );
    });

    it("edge case (spec 2.2): only queries guards with status ON_DUTY and no shiftEnd — an off-duty guard is structurally excluded", async () => {
      const claims = mockClaims();
      tx.sosAlert.create.mockResolvedValue({ id: "alert-1" });
      tx.guardShift.findMany.mockResolvedValue([]);

      await service.trigger({}, claims);

      expect(tx.guardShift.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: GuardShiftStatus.ON_DUTY,
          shiftEnd: null,
        }),
        select: { guardUserId: true },
      });
    });

    it("edge case: a resident with no house assignment cannot trigger SOS", async () => {
      const claims = mockClaims({ houseId: null });

      await expect(service.trigger({}, claims)).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.sosAlert.create).not.toHaveBeenCalled();
    });
  });

  describe("acknowledge", () => {
    it("happy path: a PENDING alert can be acknowledged", async () => {
      const claims = mockClaims({ role: "GUARD", userId: "guard-1" });
      tx.sosAlert.findUnique.mockResolvedValue({
        id: "alert-1",
        status: SosStatus.PENDING,
      });
      const updated = { id: "alert-1", status: SosStatus.ACKNOWLEDGED };
      tx.sosAlert.update.mockResolvedValue(updated);

      const result = await service.acknowledge("alert-1", claims);

      expect(result).toBe(updated);
      expect(tx.sosAlert.update).toHaveBeenCalledWith({
        where: { id: "alert-1" },
        data: {
          status: SosStatus.ACKNOWLEDGED,
          acknowledgedByGuardId: "guard-1",
        },
      });
    });

    it("edge case: cannot acknowledge an alert that is not PENDING", async () => {
      const claims = mockClaims({ role: "GUARD" });
      tx.sosAlert.findUnique.mockResolvedValue({
        id: "alert-1",
        status: SosStatus.ACKNOWLEDGED,
      });

      await expect(service.acknowledge("alert-1", claims)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("edge case: 404 when the alert does not exist", async () => {
      const claims = mockClaims({ role: "GUARD" });
      tx.sosAlert.findUnique.mockResolvedValue(null);

      await expect(service.acknowledge("missing", claims)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
