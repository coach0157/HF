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
  let tx: { user: { findUnique: jest.Mock; findMany: jest.Mock } };

  beforeEach(() => {
    service = new UsersService();
    tx = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("list — Epic 8 staff-directory restriction for non-admin callers", () => {
    it("ADMIN gets the unrestricted list, respecting any role filter", async () => {
      await service.list(
        { role: "RESIDENT" },
        mockClaims({ role: "ADMIN", houseId: null }),
      );
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: { role: "RESIDENT" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("ADMIN with no role filter gets everyone", async () => {
      await service.list({}, mockClaims({ role: "ADMIN", houseId: null }));
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: "desc" },
      });
    });

    it("RESIDENT with no filter only ever gets ADMIN/GUARD rows (no resident directory)", async () => {
      await service.list({}, mockClaims({ role: "RESIDENT" }));
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: ["ADMIN", "GUARD"] } },
        orderBy: { createdAt: "desc" },
      });
    });

    it("RESIDENT explicitly asking for role=RESIDENT is silently coerced to staff-only", async () => {
      await service.list(
        { role: "RESIDENT" },
        mockClaims({ role: "RESIDENT" }),
      );
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: ["ADMIN", "GUARD"] } },
        orderBy: { createdAt: "desc" },
      });
    });

    it("RESIDENT asking for role=GUARD gets exactly GUARD (a valid staff sub-filter)", async () => {
      await service.list({ role: "GUARD" }, mockClaims({ role: "RESIDENT" }));
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: { role: "GUARD" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("GUARD caller is subject to the same staff-only restriction as RESIDENT", async () => {
      await service.list({}, mockClaims({ role: "GUARD", houseId: null }));
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: ["ADMIN", "GUARD"] } },
        orderBy: { createdAt: "desc" },
      });
    });
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

      await expect(service.findOne("resident-2", claims)).rejects.toThrow(
        ForbiddenException,
      );
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
