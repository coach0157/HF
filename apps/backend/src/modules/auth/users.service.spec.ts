import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { UsersService } from "./users.service";
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

describe("UsersService", () => {
  let service: UsersService;
  let tx: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    service = new UsersService();
    tx = { user: { findUnique: jest.fn() } };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("findOne — ownership scoping (backend gap: GET /users/:id opened to RESIDENT/GUARD)", () => {
    it("happy path: a resident can fetch their own user record", async () => {
      const claims = mockClaims({ userId: "resident-1" });
      const user = { id: "resident-1", name: "Somchai" };
      tx.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne("resident-1", claims);

      expect(result).toBe(user);
    });

    it("edge case: a resident cannot fetch another user's record (403, not silently scoped)", async () => {
      const claims = mockClaims({ userId: "resident-1" });
      tx.user.findUnique.mockResolvedValue({
        id: "resident-2",
        name: "Other Resident",
      });

      await expect(
        service.findOne("resident-2", claims),
      ).rejects.toThrow(ForbiddenException);
    });

    it("happy path: a guard can fetch any user's record (e.g. SOS caller lookup for callback)", async () => {
      const claims = mockClaims({ userId: "guard-1", role: "GUARD" });
      const user = { id: "resident-2", name: "Some Resident" };
      tx.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne("resident-2", claims);

      expect(result).toBe(user);
    });

    it("edge case: 404 when the row doesn't exist, before the ownership check runs", async () => {
      const claims = mockClaims();
      tx.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne("missing", claims)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("internal callers (update/remove) omit claims — no ownership check applied", async () => {
      const user = { id: "resident-2", name: "Other Resident" };
      tx.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne("resident-2");

      expect(result).toBe(user);
    });
  });
});
