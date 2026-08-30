import { PatrolLogService } from "./patrol-log.service";
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

describe("PatrolLogService", () => {
  let service: PatrolLogService;
  let fileStorage: { savePhoto: jest.Mock };
  let tx: {
    patrolLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(() => {
    fileStorage = { savePhoto: jest.fn() };
    service = new PatrolLogService(fileStorage as any);
    tx = {
      patrolLog: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("create", () => {
    it("saves the photo to the 'patrol-logs' bucket and stamps guardUserId/villageId from claims, never from the body", async () => {
      const claims = mockClaims({ userId: "guard-42", villageId: "village-7" });
      fileStorage.savePhoto.mockResolvedValue(
        "local://village-patrol-logs/village-7/photo.jpg",
      );
      const created = { id: "patrol-1" };
      tx.patrolLog.create.mockResolvedValue(created);

      const result = await service.create(
        { photoDataUrl: "data:image/jpeg;base64,xxx" },
        claims,
      );

      expect(fileStorage.savePhoto).toHaveBeenCalledWith(
        "patrol-logs",
        "village-7",
        "data:image/jpeg;base64,xxx",
      );
      expect(tx.patrolLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          villageId: "village-7",
          guardUserId: "guard-42",
          photoUrl: "local://village-patrol-logs/village-7/photo.jpg",
        }),
      });
      expect(result).toBe(created);
    });

    it("note and GPS are optional — creating without them omits them from the write, not an error", async () => {
      const claims = mockClaims();
      fileStorage.savePhoto.mockResolvedValue("local://village-patrol-logs/village-1/p.jpg");
      tx.patrolLog.create.mockResolvedValue({ id: "patrol-2" });

      await service.create({ photoDataUrl: "data:image/jpeg;base64,xxx" }, claims);

      const callArg = tx.patrolLog.create.mock.calls[0][0];
      expect(callArg.data.note).toBeUndefined();
      expect(callArg.data.latitude).toBeUndefined();
      expect(callArg.data.longitude).toBeUndefined();
    });

    it("persists note + GPS when supplied", async () => {
      const claims = mockClaims();
      fileStorage.savePhoto.mockResolvedValue("local://village-patrol-logs/village-1/p.jpg");
      tx.patrolLog.create.mockResolvedValue({ id: "patrol-3" });

      await service.create(
        {
          photoDataUrl: "data:image/jpeg;base64,xxx",
          note: "ตรวจรอบประตูหลัง",
          latitude: 13.7,
          longitude: 100.5,
        },
        claims,
      );

      expect(tx.patrolLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          note: "ตรวจรอบประตูหลัง",
          latitude: 13.7,
          longitude: 100.5,
        }),
      });
    });
  });

  describe("list", () => {
    it("applies a same-day [start, end) createdAt range when date is given", async () => {
      await service.list({ date: "2026-08-28", page: 1, pageSize: 20 });

      const where = tx.patrolLog.findMany.mock.calls[0][0].where;
      const expectedStart = new Date("2026-08-28");
      expectedStart.setHours(0, 0, 0, 0);
      expect(where.createdAt.gte.getTime()).toBe(expectedStart.getTime());
      const dayAfter = new Date(where.createdAt.gte);
      dayAfter.setDate(dayAfter.getDate() + 1);
      expect(where.createdAt.lt.getTime()).toBe(dayAfter.getTime());
    });

    it("applies no date filter when date is omitted", async () => {
      await service.list({ page: 1, pageSize: 20 });

      const where = tx.patrolLog.findMany.mock.calls[0][0].where;
      expect(where.createdAt).toBeUndefined();
    });

    it("paginates via skip/take and returns total from a separate count()", async () => {
      tx.patrolLog.count.mockResolvedValue(45);
      tx.patrolLog.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);

      const result = await service.list({ page: 3, pageSize: 10 });

      expect(tx.patrolLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result).toEqual({
        items: [{ id: "a" }, { id: "b" }],
        total: 45,
        page: 3,
        pageSize: 10,
      });
    });
  });
});
