import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { UsersService } from "./users.service";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import type { FileStorageService } from "../../common/storage/file-storage.service";

jest.mock("../../common/rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
}));

// A tiny (16-byte-decoded) valid JPEG-shaped base64 data URL, well under
// MAX_AVATAR_BYTES — just needs to match FileStorageService's/UsersService's
// `data:image/...;base64,...` regex, the bytes themselves are never decoded
// as a real image anywhere in this MVP.
const VALID_AVATAR_DATA_URL = "data:image/jpeg;base64," + Buffer.from("a-small-fake-jpeg").toString("base64");

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
  let tx: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  };
  let fileStorage: { savePhoto: jest.Mock; delete: jest.Mock };

  beforeEach(() => {
    fileStorage = {
      savePhoto: jest.fn().mockResolvedValue("local://village-avatars/village-1/new.jpg"),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(fileStorage as unknown as FileStorageService);
    tx = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
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

  describe("updateAvatar — avatar upload feature (self-only, format/size validation)", () => {
    it("happy path: saves to the avatars bucket and updates the caller's own row", async () => {
      const claims = mockClaims({ userId: "resident-1", villageId: "village-1" });
      tx.user.findUnique.mockResolvedValue({ id: "resident-1", avatarUrl: null });
      tx.user.update.mockResolvedValue({ id: "resident-1", avatarUrl: "local://village-avatars/village-1/new.jpg" });

      const result = await service.updateAvatar(
        { photoDataUrl: VALID_AVATAR_DATA_URL },
        claims,
      );

      expect(fileStorage.savePhoto).toHaveBeenCalledWith(
        "avatars",
        "village-1",
        VALID_AVATAR_DATA_URL,
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: "resident-1" },
        data: { avatarUrl: "local://village-avatars/village-1/new.jpg" },
      });
      expect(result.avatarUrl).toBe("local://village-avatars/village-1/new.jpg");
    });

    it("RBAC: only ever targets claims.userId, never a caller-supplied id — a GUARD's own upload only touches their own row", async () => {
      const claims = mockClaims({ userId: "guard-1", role: "GUARD" });
      tx.user.findUnique.mockResolvedValue({ id: "guard-1", avatarUrl: null });
      tx.user.update.mockResolvedValue({ id: "guard-1" });

      await service.updateAvatar({ photoDataUrl: VALID_AVATAR_DATA_URL }, claims);

      expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { id: "guard-1" } });
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "guard-1" } }),
      );
    });

    it("deletes the previous avatar file once the new one is saved", async () => {
      const claims = mockClaims();
      tx.user.findUnique.mockResolvedValue({
        id: "resident-1",
        avatarUrl: "local://village-avatars/village-1/old.jpg",
      });
      tx.user.update.mockResolvedValue({ id: "resident-1" });

      await service.updateAvatar({ photoDataUrl: VALID_AVATAR_DATA_URL }, claims);

      expect(fileStorage.delete).toHaveBeenCalledWith(
        "local://village-avatars/village-1/old.jpg",
      );
    });

    it("validation: rejects a non-data-URL string", async () => {
      const claims = mockClaims();
      await expect(
        service.updateAvatar({ photoDataUrl: "not-a-data-url" }, claims),
      ).rejects.toThrow(BadRequestException);
      expect(fileStorage.savePhoto).not.toHaveBeenCalled();
    });

    it("validation: rejects an unsupported image mime type", async () => {
      const claims = mockClaims();
      await expect(
        service.updateAvatar(
          { photoDataUrl: "data:image/gif;base64,aGVsbG8=" },
          claims,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(fileStorage.savePhoto).not.toHaveBeenCalled();
    });

    it("validation: rejects an oversized image before ever calling savePhoto", async () => {
      const claims = mockClaims();
      // ~4MB of base64 (well over MAX_AVATAR_BYTES = 3MB) — content doesn't
      // matter, only the decoded-length pre-check does.
      const oversized = "data:image/jpeg;base64," + "A".repeat(6 * 1024 * 1024);

      await expect(
        service.updateAvatar({ photoDataUrl: oversized }, claims),
      ).rejects.toThrow(BadRequestException);
      expect(fileStorage.savePhoto).not.toHaveBeenCalled();
    });

    it("edge case: 404 if the caller's own row somehow doesn't exist", async () => {
      const claims = mockClaims();
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateAvatar({ photoDataUrl: VALID_AVATAR_DATA_URL }, claims),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
