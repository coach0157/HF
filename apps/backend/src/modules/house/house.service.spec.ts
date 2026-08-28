import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { HouseService } from "./house.service";
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

describe("HouseService", () => {
  let service: HouseService;
  let tx: { house: { findUnique: jest.Mock } };

  beforeEach(() => {
    service = new HouseService();
    tx = { house: { findUnique: jest.fn() } };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("findOne — ownership scoping (backend gap: GET /houses/:id opened to RESIDENT)", () => {
    it("happy path: a resident can fetch their own house", async () => {
      const claims = mockClaims({ houseId: "house-1" });
      const house = { id: "house-1", houseNo: "12/34" };
      tx.house.findUnique.mockResolvedValue(house);

      const result = await service.findOne("house-1", claims);

      expect(result).toBe(house);
    });

    it("edge case: a resident cannot fetch a different house in the same village (403)", async () => {
      const claims = mockClaims({ houseId: "house-1" });
      tx.house.findUnique.mockResolvedValue({ id: "house-2", houseNo: "99/1" });

      await expect(service.findOne("house-2", claims)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("happy path: guard/admin are unrestricted", async () => {
      const claims = mockClaims({ role: "GUARD", houseId: null });
      const house = { id: "house-9", houseNo: "9/9" };
      tx.house.findUnique.mockResolvedValue(house);

      const result = await service.findOne("house-9", claims);

      expect(result).toBe(house);
    });

    it("edge case: 404 when the row doesn't exist, before the ownership check runs", async () => {
      const claims = mockClaims();
      tx.house.findUnique.mockResolvedValue(null);

      await expect(service.findOne("missing", claims)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
