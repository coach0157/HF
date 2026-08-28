import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MaintenanceService } from "./maintenance.service";
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

describe("MaintenanceService", () => {
  let service: MaintenanceService;
  let fileStorage: { savePhoto: jest.Mock };
  let tx: {
    $queryRaw: jest.Mock;
    maintenanceTicket: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(() => {
    fileStorage = { savePhoto: jest.fn() };
    service = new MaintenanceService(fileStorage as any);
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ last_seq: 1 }]),
      maintenanceTicket: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("create — ticket numbering + ownership", () => {
    it("happy path: stamps villageId/houseId/createdByUserId from claims, generates ticketNumber via the atomic counter, status starts OPEN", async () => {
      const claims = mockClaims({ villageId: "village-9", houseId: "house-9" });
      tx.$queryRaw.mockResolvedValue([{ last_seq: 7 }]);
      tx.maintenanceTicket.create.mockResolvedValue({ id: "ticket-1" });

      await service.create(
        { category: "ELECTRICAL", description: "ไฟดับ" } as any,
        claims,
      );

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.maintenanceTicket.create).toHaveBeenCalledWith({
        data: {
          villageId: "village-9",
          houseId: "house-9",
          createdByUserId: "resident-1",
          category: "ELECTRICAL",
          description: "ไฟดับ",
          imageUrl: undefined,
          status: "OPEN",
          ticketNumber: "MT-000007",
        },
      });
    });

    it("uploads the photo to the general entry-logs bucket (not the sensitive-id bucket) when provided", async () => {
      const claims = mockClaims();
      fileStorage.savePhoto.mockResolvedValue("local://village-entry-logs/village-1/x.jpg");
      tx.maintenanceTicket.create.mockResolvedValue({ id: "ticket-1" });

      await service.create(
        {
          category: "PLUMBING",
          description: "ท่อรั่ว",
          photoDataUrl: "data:image/jpeg;base64,abc",
        } as any,
        claims,
      );

      expect(fileStorage.savePhoto).toHaveBeenCalledWith(
        "entry-logs",
        "village-1",
        "data:image/jpeg;base64,abc",
      );
    });

    it("rejects a resident with no house assigned", async () => {
      const claims = mockClaims({ houseId: null });

      await expect(
        service.create({ category: "OTHER", description: "x" } as any, claims),
      ).rejects.toThrow(BadRequestException);
      expect(tx.maintenanceTicket.create).not.toHaveBeenCalled();
    });
  });

  describe("list — house scoping by role", () => {
    it("resident is scoped to their own houseId", async () => {
      const claims = mockClaims({ houseId: "house-A" });

      await service.list({ page: 1, pageSize: 20 }, claims);

      expect(tx.maintenanceTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { houseId: "house-A" } }),
      );
    });

    it("resident with no houseId gets an empty page without querying", async () => {
      const claims = mockClaims({ houseId: null });

      const result = await service.list({ page: 1, pageSize: 20 }, claims);

      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
      expect(tx.maintenanceTicket.findMany).not.toHaveBeenCalled();
    });

    it("admin sees the whole village (no houseId filter)", async () => {
      const claims = mockClaims({ role: "ADMIN", houseId: null });

      await service.list({ page: 1, pageSize: 20 }, claims);

      expect(tx.maintenanceTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it("status/category filters apply for both roles", async () => {
      const claims = mockClaims({ role: "ADMIN", houseId: null });

      await service.list(
        { page: 1, pageSize: 20, status: "OPEN" as any, category: "ROAD" as any },
        claims,
      );

      expect(tx.maintenanceTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "OPEN", category: "ROAD" },
        }),
      );
    });
  });

  describe("findOne — ownership scoping", () => {
    it("404s when the ticket doesn't exist", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue(null);

      await expect(service.findOne("missing", mockClaims())).rejects.toThrow(
        NotFoundException,
      );
    });

    it("resident cannot view another house's ticket", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue({
        id: "t1",
        houseId: "house-OTHER",
      });

      await expect(
        service.findOne("t1", mockClaims({ houseId: "house-A" })),
      ).rejects.toThrow(ForbiddenException);
    });

    it("admin can view any ticket", async () => {
      const ticket = { id: "t1", houseId: "house-OTHER" };
      tx.maintenanceTicket.findUnique.mockResolvedValue(ticket);

      const result = await service.findOne(
        "t1",
        mockClaims({ role: "ADMIN", houseId: null }),
      );
      expect(result).toBe(ticket);
    });
  });

  describe("assign — sets assignedTo/scheduledDate, advances OPEN -> IN_PROGRESS", () => {
    it("404s when the ticket doesn't exist", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue(null);

      await expect(
        service.assign(
          "missing",
          { assignedTo: "Team A", scheduledDate: "2026-09-01" } as any,
          mockClaims({ role: "ADMIN" }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("OPEN ticket: sets assignedTo/scheduledDate and flips status to IN_PROGRESS", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue({
        id: "t1",
        status: "OPEN",
      });
      tx.maintenanceTicket.update.mockResolvedValue({ id: "t1", status: "IN_PROGRESS" });

      await service.assign(
        "t1",
        { assignedTo: "Team A", scheduledDate: "2026-09-01T00:00:00.000Z" } as any,
        mockClaims({ role: "ADMIN" }),
      );

      expect(tx.maintenanceTicket.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: {
          assignedTo: "Team A",
          scheduledDate: new Date("2026-09-01T00:00:00.000Z"),
          status: "IN_PROGRESS",
        },
      });
    });

    it("IN_PROGRESS ticket: re-assign updates fields but does not change status", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue({
        id: "t1",
        status: "IN_PROGRESS",
      });

      await service.assign(
        "t1",
        { assignedTo: "Team B", scheduledDate: "2026-09-02T00:00:00.000Z" } as any,
        mockClaims({ role: "ADMIN" }),
      );

      expect(tx.maintenanceTicket.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: {
          assignedTo: "Team B",
          scheduledDate: new Date("2026-09-02T00:00:00.000Z"),
          status: "IN_PROGRESS",
        },
      });
    });

    it("rejects assigning a DONE ticket", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue({
        id: "t1",
        status: "DONE",
      });

      await expect(
        service.assign(
          "t1",
          { assignedTo: "Team A", scheduledDate: "2026-09-01" } as any,
          mockClaims({ role: "ADMIN" }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.maintenanceTicket.update).not.toHaveBeenCalled();
    });
  });

  describe("updateStatus — forward-only transition guard", () => {
    it("happy path: IN_PROGRESS -> DONE", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue({
        id: "t1",
        status: "IN_PROGRESS",
      });
      tx.maintenanceTicket.update.mockResolvedValue({ id: "t1", status: "DONE" });

      const result = await service.updateStatus(
        "t1",
        { status: "DONE" } as any,
        mockClaims({ role: "ADMIN" }),
      );

      expect(tx.maintenanceTicket.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { status: "DONE" },
      });
      expect(result.status).toBe("DONE");
    });

    it("rejects skipping OPEN straight to DONE", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue({
        id: "t1",
        status: "OPEN",
      });

      await expect(
        service.updateStatus("t1", { status: "DONE" } as any, mockClaims({ role: "ADMIN" })),
      ).rejects.toThrow(BadRequestException);
      expect(tx.maintenanceTicket.update).not.toHaveBeenCalled();
    });

    it("rejects OPEN -> IN_PROGRESS via this endpoint (must go through /assign)", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue({
        id: "t1",
        status: "OPEN",
      });

      await expect(
        service.updateStatus(
          "t1",
          { status: "IN_PROGRESS" } as any,
          mockClaims({ role: "ADMIN" }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.maintenanceTicket.update).not.toHaveBeenCalled();
    });

    it("rejects a backward transition (DONE -> IN_PROGRESS)", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue({
        id: "t1",
        status: "DONE",
      });

      await expect(
        service.updateStatus(
          "t1",
          { status: "IN_PROGRESS" } as any,
          mockClaims({ role: "ADMIN" }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.maintenanceTicket.update).not.toHaveBeenCalled();
    });

    it("404s when the ticket doesn't exist", async () => {
      tx.maintenanceTicket.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus("missing", { status: "DONE" } as any, mockClaims({ role: "ADMIN" })),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
