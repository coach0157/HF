import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { EntryLogService } from "./entry-log.service";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";

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

describe("EntryLogService", () => {
  let service: EntryLogService;
  let visitorPassService: {
    resolveForScan: jest.Mock;
    markEntered: jest.Mock;
    markExited: jest.Mock;
  };
  let fileStorage: { savePhoto: jest.Mock };
  let auditService: { log: jest.Mock };
  let pushNotificationService: { send: jest.Mock };
  let tx: {
    entryLog: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    house: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    visitorPassService = {
      resolveForScan: jest.fn(),
      markEntered: jest.fn(),
      markExited: jest.fn(),
    };
    fileStorage = { savePhoto: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    pushNotificationService = { send: jest.fn() };
    service = new EntryLogService(
      visitorPassService as any,
      fileStorage as any,
      auditService as any,
      pushNotificationService as any,
    );
    tx = {
      entryLog: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findUnique: jest.fn() },
      house: { findUnique: jest.fn() },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("create — QR path, no-auto-close rule (spec 2.1, the module's central safety rule)", () => {
    it("happy path: a fresh scan (UNUSED pass) creates a new entry log", async () => {
      const claims = mockClaims();
      visitorPassService.resolveForScan.mockResolvedValue({
        id: "pass-1",
        status: "UNUSED",
        createdByUserId: "resident-1",
        visitorName: "Somchai",
        vehiclePlate: null,
      });
      tx.user.findUnique.mockResolvedValue({
        id: "resident-1",
        houseId: "house-1",
      });
      const created = { id: "log-1", exitTime: null };
      tx.entryLog.create.mockResolvedValue(created);

      const result = await service.create({ qrToken: "tok" }, claims);

      expect(result).toEqual({ entryLog: created, alreadyEntered: false });
      expect(visitorPassService.markEntered).toHaveBeenCalledWith("pass-1");

      // Epic 11 (ADR-006): push fires to the host (pass.createdByUserId)
      // on a genuine new scan-in, fire-and-forget, {type, id} data schema.
      expect(pushNotificationService.send).toHaveBeenCalledWith(
        ["resident-1"],
        expect.objectContaining({
          data: { type: "entry", id: "log-1" },
        }),
        claims,
      );
    });

    it("edge case: re-scanning an already-ENTERED pass at the exit gate must NOT auto-close — no new log, exitTime stays null", async () => {
      const claims = mockClaims();
      visitorPassService.resolveForScan.mockResolvedValue({
        id: "pass-1",
        status: "ENTERED",
      });
      const openLog = { id: "log-1", passId: "pass-1", exitTime: null };
      tx.entryLog.findFirst.mockResolvedValue(openLog);

      const result = await service.create({ qrToken: "tok" }, claims);

      expect(result).toEqual({ entryLog: openLog, alreadyEntered: true });
      expect(result.entryLog.exitTime).toBeNull();
      // Critically: no duplicate entry_log row is created, and the pass's
      // status transition (which would fire an FCM/UI side effect) never runs.
      expect(tx.entryLog.create).not.toHaveBeenCalled();
      expect(visitorPassService.markEntered).not.toHaveBeenCalled();
      // Epic 11 (ADR-006) AC #1: no push on the exit-gate re-scan.
      expect(pushNotificationService.send).not.toHaveBeenCalled();
    });
  });

  describe("confirmExit — the ONLY method allowed to set exitTime", () => {
    it("happy path: a guard confirms exit for an open entry", async () => {
      const claims = mockClaims({ role: "GUARD" });
      tx.entryLog.findUnique.mockResolvedValue({
        id: "log-1",
        exitTime: null,
        houseId: "house-1",
        passId: "pass-1",
      });
      const updated = { id: "log-1", exitTime: new Date() };
      tx.entryLog.update.mockResolvedValue(updated);

      const result = await service.confirmExit("log-1", claims);

      expect(result).toBe(updated);
      expect(tx.entryLog.update).toHaveBeenCalledWith({
        where: { id: "log-1" },
        data: expect.objectContaining({ exitConfirmationMethod: "GUARD" }),
      });
      expect(visitorPassService.markExited).toHaveBeenCalledWith("pass-1");
    });

    it("edge case: confirming exit twice is rejected — cannot re-close an already-closed entry", async () => {
      const claims = mockClaims({ role: "GUARD" });
      tx.entryLog.findUnique.mockResolvedValue({
        id: "log-1",
        exitTime: new Date(),
        houseId: "house-1",
        passId: "pass-1",
      });

      await expect(service.confirmExit("log-1", claims)).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.entryLog.update).not.toHaveBeenCalled();
    });

    it("edge case: a resident may only confirm exit for their own house", async () => {
      const claims = mockClaims({
        role: "RESIDENT",
        houseId: "house-A",
        userId: "res-1",
      });
      tx.entryLog.findUnique.mockResolvedValue({
        id: "log-1",
        exitTime: null,
        houseId: "house-B",
        passId: null,
      });

      await expect(service.confirmExit("log-1", claims)).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.entryLog.update).not.toHaveBeenCalled();
    });
  });

  describe("createManual", () => {
    it("edge case: manual entry requires visitorName, houseId, and a photo", async () => {
      const claims = mockClaims();

      await expect(service.create({} as any, claims)).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.entryLog.create).not.toHaveBeenCalled();
    });
  });

  describe("list — exited filter (QA fix for mobile's ExitConfirmScreen/GuardHomeScreen)", () => {
    it("exited=false pushes exit_time IS NULL into the where clause", async () => {
      const claims = mockClaims({ role: "GUARD" });

      await service.list({ page: 1, pageSize: 20, exited: false }, claims);

      expect(tx.entryLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ exitTime: null }),
        }),
      );
      expect(tx.entryLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ exitTime: null }),
        }),
      );
    });

    it("exited=true pushes exit_time IS NOT NULL into the where clause", async () => {
      const claims = mockClaims({ role: "GUARD" });

      await service.list({ page: 1, pageSize: 20, exited: true }, claims);

      expect(tx.entryLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ exitTime: { not: null } }),
        }),
      );
    });

    it("exited undefined applies no exit_time filter at all", async () => {
      const claims = mockClaims({ role: "GUARD" });

      await service.list({ page: 1, pageSize: 20 }, claims);

      const calledWith = tx.entryLog.findMany.mock.calls[0][0];
      expect(calledWith.where.exitTime).toBeUndefined();
    });

    it("a resident's exited filter stays scoped to their own house_id, ignoring any house_id they pass", async () => {
      const claims = mockClaims({
        role: "RESIDENT",
        houseId: "house-A",
        userId: "res-1",
      });

      await service.list(
        { page: 1, pageSize: 20, exited: false, houseId: "house-OTHER" },
        claims,
      );

      const calledWith = tx.entryLog.findMany.mock.calls[0][0];
      expect(calledWith.where.houseId).toBe("house-A");
      expect(calledWith.where.exitTime).toBeNull();
    });
  });
});
