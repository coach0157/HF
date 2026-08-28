import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ChatService } from "./chat.service";
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

describe("ChatService", () => {
  let service: ChatService;
  let fileStorage: { savePhoto: jest.Mock };
  let tx: {
    chatRoom: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    chatParticipant: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    chatMessage: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    fileStorage = { savePhoto: jest.fn() };
    service = new ChatService(fileStorage as any);
    tx = {
      chatRoom: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      chatParticipant: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    (getTenantPrismaClient as jest.Mock).mockReturnValue(tx);
  });

  describe("listRooms — lazy village-group provisioning + unread counts", () => {
    it("creates the village GROUP room on first call, upserts the caller as a participant", async () => {
      const claims = mockClaims();
      tx.chatRoom.findFirst.mockResolvedValue(null);
      tx.chatRoom.create.mockResolvedValue({ id: "group-1", villageId: "village-1", type: "GROUP" });

      await service.listRooms(claims);

      expect(tx.chatRoom.create).toHaveBeenCalledWith({
        data: {
          villageId: "village-1",
          type: "GROUP",
          name: "กลุ่มหมู่บ้าน",
          residentsCanPost: false,
        },
      });
      expect(tx.chatParticipant.upsert).toHaveBeenCalledWith({
        where: { chatRoomId_userId: { chatRoomId: "group-1", userId: "resident-1" } },
        update: {},
        create: { villageId: "village-1", chatRoomId: "group-1", userId: "resident-1" },
      });
    });

    it("does not recreate the GROUP room when one already exists", async () => {
      const claims = mockClaims();
      tx.chatRoom.findFirst.mockResolvedValue({ id: "group-1", type: "GROUP" });

      await service.listRooms(claims);

      expect(tx.chatRoom.create).not.toHaveBeenCalled();
      expect(tx.chatParticipant.upsert).toHaveBeenCalled();
    });

    it("computes unreadCount as messages from others newer than lastReadAt", async () => {
      const claims = mockClaims();
      tx.chatRoom.findFirst.mockResolvedValue({ id: "group-1", type: "GROUP" });
      const readAt = new Date("2026-01-01T00:00:00.000Z");
      tx.chatParticipant.findMany.mockResolvedValue([
        {
          chatRoomId: "room-A",
          lastReadAt: readAt,
          chatRoom: {
            id: "room-A",
            type: "DIRECT",
            messages: [{ id: "m2" }],
            participants: [
              { user: { id: "admin-1", name: "Admin A", phone: "0811111111", role: "ADMIN" } },
            ],
          },
        },
      ]);
      tx.chatMessage.count.mockResolvedValue(3);

      const result = await service.listRooms(claims);

      expect(tx.chatMessage.count).toHaveBeenCalledWith({
        where: {
          chatRoomId: "room-A",
          senderId: { not: "resident-1" },
          createdAt: { gt: readAt },
        },
      });
      expect(result[0]).toMatchObject({
        id: "room-A",
        unreadCount: 3,
        lastMessage: { id: "m2" },
        otherUser: { id: "admin-1", name: "Admin A" },
      });
      expect((result[0] as any).participants).toBeUndefined();
    });

    it("omits the createdAt filter (counts everything from others) when lastReadAt is null", async () => {
      const claims = mockClaims();
      tx.chatRoom.findFirst.mockResolvedValue({ id: "group-1", type: "GROUP" });
      tx.chatParticipant.findMany.mockResolvedValue([
        {
          chatRoomId: "room-A",
          lastReadAt: null,
          chatRoom: { id: "room-A", type: "GROUP", messages: [], participants: [] },
        },
      ]);

      const result = await service.listRooms(claims);

      expect(tx.chatMessage.count).toHaveBeenCalledWith({
        where: { chatRoomId: "room-A", senderId: { not: "resident-1" } },
      });
      expect(result[0].otherUser).toBeNull();
    });
  });

  describe("createRoom — DIRECT find-or-create + role-pair validation", () => {
    it("rejects a resident<->resident direct chat", async () => {
      tx.user.findUnique.mockResolvedValue({ id: "resident-2", role: "RESIDENT" });

      await expect(
        service.createRoom({ type: "DIRECT", targetUserId: "resident-2" } as any, mockClaims()),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects an admin<->guard direct chat", async () => {
      tx.user.findUnique.mockResolvedValue({ id: "guard-1", role: "GUARD" });

      await expect(
        service.createRoom(
          { type: "DIRECT", targetUserId: "guard-1" } as any,
          mockClaims({ role: "ADMIN", houseId: null }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("allows resident<->admin and reuses an existing 2-participant room", async () => {
      tx.user.findUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
      const existingRoom = {
        id: "room-1",
        type: "DIRECT",
        participants: [{ userId: "resident-1" }, { userId: "admin-1" }],
      };
      tx.chatRoom.findFirst.mockResolvedValue(existingRoom);

      const result = await service.createRoom(
        { type: "DIRECT", targetUserId: "admin-1" } as any,
        mockClaims(),
      );

      expect(result).toBe(existingRoom);
      expect(tx.chatRoom.create).not.toHaveBeenCalled();
    });

    it("creates a new DIRECT room with both participants when none exists", async () => {
      tx.user.findUnique.mockResolvedValue({ id: "guard-1", role: "GUARD" });
      tx.chatRoom.findFirst.mockResolvedValue(null);
      tx.chatRoom.create.mockResolvedValue({ id: "room-2" });

      await service.createRoom({ type: "DIRECT", targetUserId: "guard-1" } as any, mockClaims());

      expect(tx.chatRoom.create).toHaveBeenCalledWith({
        data: {
          villageId: "village-1",
          type: "DIRECT",
          participants: {
            create: [
              { villageId: "village-1", userId: "resident-1" },
              { villageId: "village-1", userId: "guard-1" },
            ],
          },
        },
      });
    });

    it("rejects creating a direct chat with yourself", async () => {
      await expect(
        service.createRoom({ type: "DIRECT", targetUserId: "resident-1" } as any, mockClaims()),
      ).rejects.toThrow(BadRequestException);
    });

    it("404s when targetUserId doesn't resolve (cross-tenant or nonexistent)", async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createRoom({ type: "DIRECT", targetUserId: "ghost" } as any, mockClaims()),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects targetUserId missing for a DIRECT room", async () => {
      await expect(
        service.createRoom({ type: "DIRECT" } as any, mockClaims()),
      ).rejects.toThrow(BadRequestException);
    });

    it("GROUP creation is admin-only", async () => {
      await expect(
        service.createRoom({ type: "GROUP", name: "x" } as any, mockClaims({ role: "RESIDENT" })),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.chatRoom.create).not.toHaveBeenCalled();
    });

    it("admin can create a GROUP room and is added as a participant", async () => {
      tx.chatRoom.create.mockResolvedValue({ id: "group-2" });
      const adminClaims = mockClaims({ role: "ADMIN", userId: "admin-1", houseId: null });

      await service.createRoom(
        { type: "GROUP", name: "ประกาศพิเศษ", residentsCanPost: true } as any,
        adminClaims,
      );

      expect(tx.chatRoom.create).toHaveBeenCalledWith({
        data: {
          villageId: "village-1",
          type: "GROUP",
          name: "ประกาศพิเศษ",
          residentsCanPost: true,
        },
      });
      expect(tx.chatParticipant.create).toHaveBeenCalledWith({
        data: { villageId: "village-1", chatRoomId: "group-2", userId: "admin-1" },
      });
    });
  });

  describe("updateRoom — admin-only, GROUP rooms only", () => {
    it("rejects a non-admin", async () => {
      await expect(
        service.updateRoom("group-1", { residentsCanPost: true } as any, mockClaims()),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.chatRoom.findFirst).not.toHaveBeenCalled();
    });

    it("404s when the room doesn't exist", async () => {
      (tx.chatRoom as any).findUnique = jest.fn().mockResolvedValue(null);
      await expect(
        service.updateRoom(
          "missing",
          { residentsCanPost: true } as any,
          mockClaims({ role: "ADMIN", houseId: null }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects updating a DIRECT room", async () => {
      (tx.chatRoom as any).findUnique = jest.fn().mockResolvedValue({ id: "room-A", type: "DIRECT" });
      await expect(
        service.updateRoom(
          "room-A",
          { residentsCanPost: true } as any,
          mockClaims({ role: "ADMIN", houseId: null }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("admin can flip residentsCanPost on the village GROUP room", async () => {
      (tx.chatRoom as any).findUnique = jest.fn().mockResolvedValue({ id: "group-1", type: "GROUP" });
      (tx.chatRoom as any).update = jest.fn().mockResolvedValue({ id: "group-1", residentsCanPost: true });

      const result = await service.updateRoom(
        "group-1",
        { residentsCanPost: true } as any,
        mockClaims({ role: "ADMIN", houseId: null }),
      );

      expect((tx.chatRoom as any).update).toHaveBeenCalledWith({
        where: { id: "group-1" },
        data: { residentsCanPost: true },
      });
      expect(result).toEqual({ id: "group-1", residentsCanPost: true });
    });
  });

  describe("room-membership authorization — ADR-005 point 4", () => {
    it("getMessages rejects a caller who is not a participant", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessages("room-X", mockClaims(), 1, 30),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.chatMessage.findMany).not.toHaveBeenCalled();
    });

    it("getMessages returns paginated history for a participant", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue({
        chatRoom: { id: "room-A", type: "DIRECT" },
      });
      tx.chatMessage.findMany.mockResolvedValue([{ id: "m1" }]);
      tx.chatMessage.count.mockResolvedValue(1);

      const result = await service.getMessages("room-A", mockClaims(), 1, 30);

      expect(result).toEqual({ items: [{ id: "m1" }], total: 1, page: 1, pageSize: 30 });
    });

    it("markRead rejects a non-participant and updates lastReadAt for a member", async () => {
      tx.chatParticipant.findUnique.mockResolvedValueOnce(null);
      await expect(service.markRead("room-X", mockClaims())).rejects.toThrow(ForbiddenException);

      tx.chatParticipant.findUnique.mockResolvedValueOnce({ chatRoom: { id: "room-A" } });
      tx.chatParticipant.update.mockResolvedValue({ lastReadAt: new Date("2026-01-01") });
      const result = await service.markRead("room-A", mockClaims());
      expect(tx.chatParticipant.update).toHaveBeenCalledWith({
        where: { chatRoomId_userId: { chatRoomId: "room-A", userId: "resident-1" } },
        data: { lastReadAt: expect.any(Date) },
      });
      expect(result.lastReadAt).toEqual(new Date("2026-01-01"));
    });

    it("assertCanJoin rejects a non-participant (join_room WS event authorization)", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue(null);
      await expect(service.assertCanJoin("room-X", mockClaims())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("attachImage rejects a non-participant before touching FileStorageService", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue(null);
      await expect(
        service.attachImage("room-X", "data:image/jpeg;base64,abc", mockClaims()),
      ).rejects.toThrow(ForbiddenException);
      expect(fileStorage.savePhoto).not.toHaveBeenCalled();
    });

    it("attachImage saves to the general entry-logs bucket for a participant", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue({ chatRoom: { id: "room-A" } });
      fileStorage.savePhoto.mockResolvedValue("local://village-entry-logs/village-1/x.jpg");

      const result = await service.attachImage(
        "room-A",
        "data:image/jpeg;base64,abc",
        mockClaims(),
      );

      expect(fileStorage.savePhoto).toHaveBeenCalledWith(
        "entry-logs",
        "village-1",
        "data:image/jpeg;base64,abc",
      );
      expect(result).toEqual({ imageUrl: "local://village-entry-logs/village-1/x.jpg" });
    });
  });

  describe("sendMessage — residentsCanPost enforcement", () => {
    it("rejects an empty message with no image", async () => {
      await expect(
        service.sendMessage("room-A", {}, mockClaims()),
      ).rejects.toThrow(BadRequestException);
      expect(tx.chatParticipant.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a resident posting in a GROUP room when residentsCanPost=false", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue({
        chatRoom: { id: "group-1", type: "GROUP", residentsCanPost: false },
      });

      await expect(
        service.sendMessage("group-1", { message: "hello" }, mockClaims()),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.chatMessage.create).not.toHaveBeenCalled();
    });

    it("allows a resident to post in a GROUP room when residentsCanPost=true", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue({
        chatRoom: { id: "group-1", type: "GROUP", residentsCanPost: true },
      });
      tx.chatMessage.create.mockResolvedValue({ id: "msg-1", message: "hello" });

      const result = await service.sendMessage("group-1", { message: "hello" }, mockClaims());

      expect(result).toEqual({ id: "msg-1", message: "hello" });
    });

    it("always allows ADMIN to post in a read-only GROUP room (broadcast)", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue({
        chatRoom: { id: "group-1", type: "GROUP", residentsCanPost: false },
      });
      tx.chatMessage.create.mockResolvedValue({ id: "msg-1" });

      await service.sendMessage(
        "group-1",
        { message: "ประกาศ" },
        mockClaims({ role: "ADMIN", userId: "admin-1", houseId: null }),
      );

      expect(tx.chatMessage.create).toHaveBeenCalled();
    });

    it("always allows a resident to post in a DIRECT room regardless of residentsCanPost", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue({
        chatRoom: { id: "room-A", type: "DIRECT", residentsCanPost: false },
      });
      tx.chatMessage.create.mockResolvedValue({ id: "msg-1" });

      await service.sendMessage("room-A", { message: "hi" }, mockClaims());

      expect(tx.chatMessage.create).toHaveBeenCalled();
    });

    it("persists an image-only message", async () => {
      tx.chatParticipant.findUnique.mockResolvedValue({
        chatRoom: { id: "room-A", type: "DIRECT", residentsCanPost: false },
      });
      tx.chatMessage.create.mockResolvedValue({ id: "msg-1" });

      await service.sendMessage(
        "room-A",
        { imageUrl: "local://village-entry-logs/village-1/x.jpg" },
        mockClaims(),
      );

      expect(tx.chatMessage.create).toHaveBeenCalledWith({
        data: {
          villageId: "village-1",
          chatRoomId: "room-A",
          senderId: "resident-1",
          message: undefined,
          imageUrl: "local://village-entry-logs/village-1/x.jpg",
        },
      });
    });
  });
});
