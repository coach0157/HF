import { NotFoundException } from "@nestjs/common";
import { TransportProviderService } from "./transport-provider.service";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";

jest.mock("../../common/rls/tenant-context", () => ({
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

describe("TransportProviderService", () => {
  let service: TransportProviderService;
  let tx: {
    transportProvider: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    service = new TransportProviderService();
    tx = {
      transportProvider: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("create", () => {
    it("stamps villageId from claims, not the DTO", async () => {
      const claims = mockClaims({ role: "ADMIN", villageId: "village-9" });
      tx.transportProvider.create.mockResolvedValue({ id: "tp-1" });

      await service.create(
        {
          name: "Somchai",
          type: "MOTORCYCLE",
          phone: "0811111111",
          serviceArea: "โซน A",
        } as any,
        claims,
      );

      expect(tx.transportProvider.create).toHaveBeenCalledWith({
        data: {
          villageId: "village-9",
          name: "Somchai",
          type: "MOTORCYCLE",
          phone: "0811111111",
          serviceArea: "โซน A",
        },
      });
    });
  });

  describe("list — role-based active scoping", () => {
    it("RESIDENT is always forced to isActive: true, even if it asks for active=false", async () => {
      const claims = mockClaims({ role: "RESIDENT" });
      tx.transportProvider.findMany.mockResolvedValue([]);

      await service.list(claims, { active: "false" });

      expect(tx.transportProvider.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
    });

    it("GUARD is also forced to isActive: true", async () => {
      const claims = mockClaims({ role: "GUARD", houseId: null });
      tx.transportProvider.findMany.mockResolvedValue([]);

      await service.list(claims, {});

      expect(tx.transportProvider.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
    });

    it("ADMIN with no active filter sees everything (no isActive clause)", async () => {
      const claims = mockClaims({ role: "ADMIN", houseId: null });
      tx.transportProvider.findMany.mockResolvedValue([]);

      await service.list(claims, {});

      expect(tx.transportProvider.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: "asc" },
      });
    });

    it("ADMIN can narrow with ?active=false to see only inactive rows", async () => {
      const claims = mockClaims({ role: "ADMIN", houseId: null });
      tx.transportProvider.findMany.mockResolvedValue([]);

      await service.list(claims, { active: "false" });

      expect(tx.transportProvider.findMany).toHaveBeenCalledWith({
        where: { isActive: false },
        orderBy: { name: "asc" },
      });
    });

    it("type filter is applied for every role", async () => {
      const claims = mockClaims({ role: "RESIDENT" });
      tx.transportProvider.findMany.mockResolvedValue([]);

      await service.list(claims, { type: "TAXI" });

      expect(tx.transportProvider.findMany).toHaveBeenCalledWith({
        where: { isActive: true, type: "TAXI" },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("update", () => {
    it("404s when the row doesn't exist", async () => {
      tx.transportProvider.findUnique.mockResolvedValue(null);

      await expect(
        service.update("missing", { name: "New name" } as any),
      ).rejects.toThrow(NotFoundException);
      expect(tx.transportProvider.update).not.toHaveBeenCalled();
    });

    it("happy path: toggles isActive", async () => {
      tx.transportProvider.findUnique.mockResolvedValue({ id: "tp-1" });
      tx.transportProvider.update.mockResolvedValue({
        id: "tp-1",
        isActive: false,
      });

      const result = await service.update("tp-1", { isActive: false });

      expect(tx.transportProvider.update).toHaveBeenCalledWith({
        where: { id: "tp-1" },
        data: {
          name: undefined,
          type: undefined,
          phone: undefined,
          serviceArea: undefined,
          isActive: false,
        },
      });
      expect(result.isActive).toBe(false);
    });
  });

  describe("remove", () => {
    it("404s when the row doesn't exist", async () => {
      tx.transportProvider.findUnique.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toThrow(
        NotFoundException,
      );
      expect(tx.transportProvider.delete).not.toHaveBeenCalled();
    });

    it("happy path: deletes the row", async () => {
      tx.transportProvider.findUnique.mockResolvedValue({ id: "tp-1" });
      tx.transportProvider.delete.mockResolvedValue({ id: "tp-1" });

      await service.remove("tp-1");

      expect(tx.transportProvider.delete).toHaveBeenCalledWith({
        where: { id: "tp-1" },
      });
    });
  });
});
