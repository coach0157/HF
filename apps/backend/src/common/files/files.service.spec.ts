import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { promises as fs } from "node:fs";
import { FilesService } from "./files.service";
import { getTenantPrismaClient } from "../rls/tenant-context";
import type { TenantClaims } from "../rls/tenant-context";

jest.mock("../rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
}));

// Only override promises.access — a full-module mock breaks unrelated code
// (e.g. @prisma/client's own use of fs.existsSync at import time) that
// happens to load transitively through ChatService's @prisma/client import.
jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs");
  return {
    ...actual,
    promises: { ...actual.promises, access: jest.fn() },
  };
});

function mockClaims(overrides: Partial<TenantClaims> = {}): TenantClaims {
  return {
    userId: "user-1",
    villageId: "village-1",
    role: "RESIDENT",
    houseId: "house-1",
    ...overrides,
  };
}

describe("FilesService", () => {
  let service: FilesService;
  let fileStorage: {
    resolveBucketKey: jest.Mock;
    resolveDiskPath: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let chatService: { assertCanJoin: jest.Mock };
  let tx: {
    entryLog: { findFirst: jest.Mock };
    maintenanceTicket: { findFirst: jest.Mock };
    chatMessage: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    fileStorage = {
      resolveBucketKey: jest.fn(),
      resolveDiskPath: jest.fn().mockReturnValue("/uploads/some/disk/path.jpg"),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    chatService = { assertCanJoin: jest.fn().mockResolvedValue(undefined) };
    tx = {
      entryLog: { findFirst: jest.fn().mockResolvedValue(null) },
      maintenanceTicket: { findFirst: jest.fn().mockResolvedValue(null) },
      chatMessage: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
    (fs.access as jest.Mock).mockResolvedValue(undefined);

    service = new FilesService(
      fileStorage as any,
      auditService as any,
      chatService as any,
    );
  });

  const FILENAME = "photo.jpg";
  const VILLAGE = "village-1";

  describe("tenant isolation", () => {
    it("rejects with 404 when the path villageId doesn't match the caller's own village", async () => {
      const claims = mockClaims({ villageId: "village-1" });
      await expect(
        service.resolveFilePath("village-avatars", "some-other-village", FILENAME, claims),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Rejected before ever resolving a bucket/disk path or hitting the DB.
      expect(fileStorage.resolveBucketKey).not.toHaveBeenCalled();
    });
  });

  describe("avatars bucket", () => {
    it("any authenticated same-village role may view it", async () => {
      fileStorage.resolveBucketKey.mockReturnValue("avatars");
      for (const role of ["RESIDENT", "GUARD", "ADMIN"] as const) {
        const claims = mockClaims({ role });
        await expect(
          service.resolveFilePath("village-avatars", VILLAGE, FILENAME, claims),
        ).resolves.toBe("/uploads/some/disk/path.jpg");
      }
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it("404s an unrecognized bucket folder name", async () => {
      fileStorage.resolveBucketKey.mockReturnValue(null);
      const claims = mockClaims({ role: "ADMIN" });
      await expect(
        service.resolveFilePath("not-a-real-bucket", VILLAGE, FILENAME, claims),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("sensitive-id bucket", () => {
    beforeEach(() => {
      fileStorage.resolveBucketKey.mockReturnValue("sensitive-id");
    });

    it("ADMIN can view it and it is audit-logged", async () => {
      const claims = mockClaims({ role: "ADMIN" });
      await expect(
        service.resolveFilePath("village-sensitive-id-photos", VILLAGE, FILENAME, claims),
      ).resolves.toBe("/uploads/some/disk/path.jpg");

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "VIEW_SENSITIVE_ID_PHOTO",
          resourceType: "sensitive_id_photo",
        }),
      );
    });

    it("GUARD can view it and it is NOT audit-logged (only ADMIN views are)", async () => {
      const claims = mockClaims({ role: "GUARD" });
      await expect(
        service.resolveFilePath("village-sensitive-id-photos", VILLAGE, FILENAME, claims),
      ).resolves.toBe("/uploads/some/disk/path.jpg");
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it("RESIDENT is rejected with 403, even for their own house's entry", async () => {
      const claims = mockClaims({ role: "RESIDENT" });
      await expect(
        service.resolveFilePath("village-sensitive-id-photos", VILLAGE, FILENAME, claims),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe("entry-logs bucket — reverse lookup priority: entry_logs -> maintenance_tickets -> chat_messages", () => {
    beforeEach(() => {
      fileStorage.resolveBucketKey.mockReturnValue("entry-logs");
    });

    describe("matches an entry_logs row", () => {
      it("GUARD/ADMIN can always view it", async () => {
        tx.entryLog.findFirst.mockResolvedValue({ id: "log-1", houseId: "house-99" });
        for (const role of ["GUARD", "ADMIN"] as const) {
          const claims = mockClaims({ role, houseId: null });
          await expect(
            service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
          ).resolves.toBe("/uploads/some/disk/path.jpg");
        }
      });

      it("RESIDENT can view it only when it belongs to their own house", async () => {
        tx.entryLog.findFirst.mockResolvedValue({ id: "log-1", houseId: "house-1" });
        const claims = mockClaims({ role: "RESIDENT", houseId: "house-1" });
        await expect(
          service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
        ).resolves.toBe("/uploads/some/disk/path.jpg");
      });

      it("RESIDENT is rejected for another house's entry log photo", async () => {
        tx.entryLog.findFirst.mockResolvedValue({ id: "log-1", houseId: "house-OTHER" });
        const claims = mockClaims({ role: "RESIDENT", houseId: "house-1" });
        await expect(
          service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe("matches a maintenance_tickets row (no entry_logs match)", () => {
      it("ADMIN can always view it", async () => {
        tx.maintenanceTicket.findFirst.mockResolvedValue({ id: "t-1", houseId: "house-99" });
        const claims = mockClaims({ role: "ADMIN" });
        await expect(
          service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
        ).resolves.toBe("/uploads/some/disk/path.jpg");
      });

      it("RESIDENT can view only their own house's ticket photo", async () => {
        tx.maintenanceTicket.findFirst.mockResolvedValue({ id: "t-1", houseId: "house-1" });
        const claims = mockClaims({ role: "RESIDENT", houseId: "house-1" });
        await expect(
          service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
        ).resolves.toBe("/uploads/some/disk/path.jpg");
      });

      it("RESIDENT is rejected for another house's ticket photo", async () => {
        tx.maintenanceTicket.findFirst.mockResolvedValue({ id: "t-1", houseId: "house-OTHER" });
        const claims = mockClaims({ role: "RESIDENT", houseId: "house-1" });
        await expect(
          service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it("GUARD is rejected — maintenance has no guard-facing access at all", async () => {
        tx.maintenanceTicket.findFirst.mockResolvedValue({ id: "t-1", houseId: "house-1" });
        const claims = mockClaims({ role: "GUARD", houseId: null });
        await expect(
          service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe("matches a chat_messages row (no entry_logs/maintenance_tickets match)", () => {
      it("delegates to ChatService.assertCanJoin() — allowed when it resolves", async () => {
        tx.chatMessage.findFirst.mockResolvedValue({ id: "m-1", chatRoomId: "room-1" });
        const claims = mockClaims({ role: "RESIDENT" });
        await expect(
          service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
        ).resolves.toBe("/uploads/some/disk/path.jpg");
        expect(chatService.assertCanJoin).toHaveBeenCalledWith("room-1", claims);
      });

      it("propagates ForbiddenException from assertCanJoin() — no ADMIN bypass", async () => {
        tx.chatMessage.findFirst.mockResolvedValue({ id: "m-1", chatRoomId: "room-1" });
        chatService.assertCanJoin.mockRejectedValue(
          new ForbiddenException("You are not a participant of this chat room"),
        );
        const claims = mockClaims({ role: "ADMIN" });
        await expect(
          service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    it("404s an orphaned ref that matches nothing in any of the three tables", async () => {
      const claims = mockClaims({ role: "ADMIN" });
      await expect(
        service.resolveFilePath("village-entry-logs", VILLAGE, FILENAME, claims),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("disk existence", () => {
    it("404s when resolveDiskPath() returns null (traversal/unsafe segment)", async () => {
      fileStorage.resolveBucketKey.mockReturnValue("avatars");
      fileStorage.resolveDiskPath.mockReturnValue(null);
      const claims = mockClaims({ role: "RESIDENT" });
      await expect(
        service.resolveFilePath("village-avatars", VILLAGE, "..", claims),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("404s when the file no longer exists on disk", async () => {
      fileStorage.resolveBucketKey.mockReturnValue("avatars");
      (fs.access as jest.Mock).mockRejectedValue(new Error("ENOENT"));
      const claims = mockClaims({ role: "RESIDENT" });
      await expect(
        service.resolveFilePath("village-avatars", VILLAGE, FILENAME, claims),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
