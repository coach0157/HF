import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  AnnouncementLevel,
  AnnouncementTargetScope,
  UserRole,
} from "@prisma/client";
import { AnnouncementService } from "./announcement.service";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";

jest.mock("../../common/rls/tenant-context", () => ({
  getTenantPrismaClient: jest.fn(),
}));

function mockClaims(overrides: Partial<TenantClaims> = {}): TenantClaims {
  return {
    userId: "admin-1",
    villageId: "village-1",
    role: "ADMIN",
    houseId: null,
    ...overrides,
  };
}

describe("AnnouncementService", () => {
  let service: AnnouncementService;
  let pushNotificationService: { send: jest.Mock };
  let tx: {
    announcement: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    announcementTarget: { createMany: jest.Mock; findMany: jest.Mock };
    announcementRead: { upsert: jest.Mock };
    user: { findMany: jest.Mock };
    house: { findMany: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(() => {
    pushNotificationService = { send: jest.fn() };
    service = new AnnouncementService(pushNotificationService as any);
    tx = {
      announcement: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      announcementTarget: { createMany: jest.fn(), findMany: jest.fn() },
      announcementRead: { upsert: jest.fn() },
      user: { findMany: jest.fn() },
      house: { findMany: jest.fn(), findUnique: jest.fn() },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("create", () => {
    it("happy path: ALL scope resolves every resident as a recipient", async () => {
      const claims = mockClaims();
      const created = {
        id: "ann-1",
        title: "Water outage",
        content: "Water will be off 10:00-12:00",
        level: AnnouncementLevel.NORMAL,
        targetScope: AnnouncementTargetScope.ALL,
      };
      tx.announcement.create.mockResolvedValue(created);
      tx.user.findMany.mockResolvedValue([{ id: "res-1" }, { id: "res-2" }]);

      const result = await service.create(
        {
          title: "Water outage",
          content: "Water will be off 10:00-12:00",
          level: AnnouncementLevel.NORMAL,
          targetScope: AnnouncementTargetScope.ALL,
        },
        claims,
      );

      expect(result.announcement).toBe(created);
      expect(result.recipientUserIds).toEqual(["res-1", "res-2"]);
      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: { role: UserRole.RESIDENT },
        select: { id: true },
      });

      // Epic 11 (ADR-006): push fires for every level (not emergency-only),
      // fire-and-forget, deep-link data is exactly {type, id}.
      expect(pushNotificationService.send).toHaveBeenCalledWith(
        ["res-1", "res-2"],
        expect.objectContaining({
          data: { type: "announcement", id: "ann-1" },
        }),
        claims,
      );
    });

    it("Epic 11 (ADR-006): EMERGENCY level prefixes the push title but keeps data schema as {type, id}", async () => {
      const claims = mockClaims();
      const created = {
        id: "ann-2",
        title: "Fire evacuation",
        content: "Evacuate now",
        level: AnnouncementLevel.EMERGENCY,
        targetScope: AnnouncementTargetScope.ALL,
      };
      tx.announcement.create.mockResolvedValue(created);
      tx.user.findMany.mockResolvedValue([{ id: "res-1" }]);

      await service.create(
        {
          title: "Fire evacuation",
          content: "Evacuate now",
          level: AnnouncementLevel.EMERGENCY,
          targetScope: AnnouncementTargetScope.ALL,
        },
        claims,
      );

      expect(pushNotificationService.send).toHaveBeenCalledWith(
        ["res-1"],
        expect.objectContaining({
          title: expect.stringContaining("Fire evacuation"),
          data: { type: "announcement", id: "ann-2" },
        }),
        claims,
      );
      const [, payload] = pushNotificationService.send.mock.calls[0];
      expect(payload.title).toMatch(/ฉุกเฉิน/);
    });

    it("edge case: HOUSE scope requires targetHouseIds", async () => {
      const claims = mockClaims();

      await expect(
        service.create(
          {
            title: "t",
            content: "c",
            level: AnnouncementLevel.NORMAL,
            targetScope: AnnouncementTargetScope.HOUSE,
          },
          claims,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.announcement.create).not.toHaveBeenCalled();
    });

    it("edge case: ZONE scope requires targetZone", async () => {
      const claims = mockClaims();

      await expect(
        service.create(
          {
            title: "t",
            content: "c",
            level: AnnouncementLevel.EMERGENCY,
            targetScope: AnnouncementTargetScope.ZONE,
          },
          claims,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(tx.announcement.create).not.toHaveBeenCalled();
    });
  });

  describe("markRead", () => {
    it("happy path: idempotent upsert keyed on the compound unique (announcementId, userId)", async () => {
      const claims = mockClaims({
        role: "RESIDENT",
        userId: "res-1",
        houseId: "house-1",
      });
      tx.announcement.findUnique.mockResolvedValue({ id: "ann-1" });
      const readRow = { announcementId: "ann-1", userId: "res-1" };
      tx.announcementRead.upsert.mockResolvedValue(readRow);

      const result = await service.markRead("ann-1", claims);

      expect(result).toBe(readRow);
      expect(tx.announcementRead.upsert).toHaveBeenCalledWith({
        where: {
          announcementId_userId: { announcementId: "ann-1", userId: "res-1" },
        },
        update: {},
        create: expect.objectContaining({
          announcementId: "ann-1",
          userId: "res-1",
        }),
      });
    });

    it("edge case: 404 when marking a nonexistent announcement as read", async () => {
      const claims = mockClaims({ role: "RESIDENT", userId: "res-1" });
      tx.announcement.findUnique.mockResolvedValue(null);

      await expect(service.markRead("missing", claims)).rejects.toThrow(
        NotFoundException,
      );
      expect(tx.announcementRead.upsert).not.toHaveBeenCalled();
    });
  });
});
