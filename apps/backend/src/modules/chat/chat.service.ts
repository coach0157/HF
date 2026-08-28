import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ChatRoom, ChatRoomType, PrismaClient } from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { FileStorageService } from "../../common/storage/file-storage.service";
import { CreateChatRoomDto } from "./dto/create-chat-room.dto";
import { UpdateChatRoomDto } from "./dto/update-chat-room.dto";

/**
 * Epic 8 — Chat (spec 2.3 / docs/PHASE2_BACKLOG.md Epic 8, ADR-004/005 in
 * docs/ARCHITECTURE.md §8.1-8.2). Shared by both the REST controller
 * (ChatController) and the WebSocket gateway (ChatGateway) — this is the
 * point of ADR-005: one service, called from two transports, both already
 * running inside an RLS-scoped transaction (RlsInterceptor for REST,
 * WsRlsInterceptor for WS) by the time any method here runs, so every
 * `getTenantPrismaClient()` call is automatically village-scoped.
 *
 * Room-level authorization (ADR-005 point 4 — RLS only isolates by village,
 * NOT by which specific room a user belongs to) is enforced explicitly by
 * `assertMembership()` below, called from every method that reads/writes a
 * specific room's messages.
 */
@Injectable()
export class ChatService {
  constructor(private readonly fileStorage: FileStorageService) {}

  /**
   * Every village gets exactly one auto-provisioned GROUP room ("กลุ่ม
   * หมู่บ้าน"), lazy-created the first time anyone in the village calls
   * `GET /chat-rooms` (Dev-agent decision — PHASE2_BACKLOG.md Epic 8 left
   * "lazy-create ตอน admin คนแรก login หรือ seed ตอนสร้างหมู่บ้าน" as an
   * open choice). Lazy-create-on-list is preferred over a village-creation
   * hook because it needs no change to the auth/village-provisioning flow
   * and self-heals for villages that already existed before Epic 8 shipped.
   *
   * Every call also upserts the CALLER as a participant of that room — this
   * is the "sync participant (เพิ่มลูกบ้าน/รปภ./แอดมินใหม่เข้าห้องอัตโนมัติ)"
   * requirement: rather than a separate batch job reacting to new-user
   * creation, membership is synced lazily the next time that user opens
   * their chat list, which is simpler and can't drift out of sync with the
   * user table.
   */
  private static readonly DEFAULT_GROUP_ROOM_NAME = "กลุ่มหมู่บ้าน";

  private async ensureVillageGroupRoom(
    tx: PrismaClient,
    claims: TenantClaims,
  ): Promise<ChatRoom> {
    // Matched by name, not just `{villageId, type: GROUP}` — an admin can
    // create additional GROUP rooms via POST /chat-rooms (see createRoom
    // below), and this lookup must not accidentally treat one of THOSE as
    // "the" auto-provisioned default room (which would silently skip
    // creating the real default room and leave every user's chat list
    // missing "กลุ่มหมู่บ้าน").
    let room = await tx.chatRoom.findFirst({
      where: {
        villageId: claims.villageId,
        type: ChatRoomType.GROUP,
        name: ChatService.DEFAULT_GROUP_ROOM_NAME,
      },
    });
    if (!room) {
      room = await tx.chatRoom.create({
        data: {
          villageId: claims.villageId,
          type: ChatRoomType.GROUP,
          name: ChatService.DEFAULT_GROUP_ROOM_NAME,
          residentsCanPost: false,
        },
      });
    }

    await tx.chatParticipant.upsert({
      where: {
        chatRoomId_userId: { chatRoomId: room.id, userId: claims.userId },
      },
      update: {},
      create: {
        villageId: claims.villageId,
        chatRoomId: room.id,
        userId: claims.userId,
      },
    });

    return room;
  }

  /**
   * ADR-005 point 4 — the room-level authorization check that RLS does NOT
   * do. Returns the room row (so callers don't need a second query) if
   * `userId` is a participant; throws otherwise.
   *
   * Deliberately always throws `ForbiddenException` (never `NotFoundException`)
   * regardless of whether the room doesn't exist at all, belongs to another
   * village (RLS already hides it from this query), or exists in this
   * village but the caller just isn't a member — all three cases produce the
   * exact same "you cannot act on this room" answer, and collapsing them
   * avoids leaking which case it was (e.g. confirming a room id exists in a
   * village the caller has no access to).
   */
  private async assertMembership(
    tx: PrismaClient,
    chatRoomId: string,
    userId: string,
  ): Promise<ChatRoom> {
    const participant = await tx.chatParticipant.findUnique({
      where: { chatRoomId_userId: { chatRoomId, userId } },
      include: { chatRoom: true },
    });
    if (!participant) {
      throw new ForbiddenException(
        "You are not a participant of this chat room",
      );
    }
    return participant.chatRoom;
  }

  /**
   * `GET /chat-rooms` — every room the caller participates in (their group
   * room(s) + any DIRECT rooms), each with its most recent message, an
   * unread count (messages from someone else, newer than this participant's
   * `lastReadAt` — spec 2.3's "ประวัติแชทเก็บถาวร" implies read state should
   * persist across sessions, which is exactly what `lastReadAt` is for), and
   * the OTHER participant's basic identity for DIRECT rooms (`otherUser`) —
   * without this, a client has no way to show "who" a DIRECT room is with
   * (a room's own fields carry no participant names). Not itemized in
   * PHASE2_BACKLOG.md Epic 8's literal task list, but both admin-web's and
   * mobile's chat list screens need it to render anything meaningful.
   */
  async listRooms(claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    await this.ensureVillageGroupRoom(tx, claims);

    const participantRows = await tx.chatParticipant.findMany({
      where: { userId: claims.userId },
      include: {
        chatRoom: {
          include: {
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
            participants: {
              where: { userId: { not: claims.userId } },
              include: {
                user: {
                  select: { id: true, name: true, phone: true, role: true },
                },
              },
            },
          },
        },
      },
    });

    return Promise.all(
      participantRows.map(async (p) => {
        const unreadCount = await tx.chatMessage.count({
          where: {
            chatRoomId: p.chatRoomId,
            senderId: { not: claims.userId },
            ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
          },
        });
        const { messages, participants, ...room } = p.chatRoom;
        return {
          ...room,
          lastMessage: messages[0] ?? null,
          lastReadAt: p.lastReadAt,
          unreadCount,
          otherUser:
            room.type === ChatRoomType.DIRECT
              ? (participants[0]?.user ?? null)
              : null,
        };
      }),
    );
  }

  /**
   * `POST /chat-rooms`. See CreateChatRoomDto's doc comment for the
   * DIRECT/GROUP behavior split.
   */
  async createRoom(dto: CreateChatRoomDto, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();

    if (dto.type === ChatRoomType.GROUP) {
      if (claims.role !== "ADMIN") {
        throw new ForbiddenException(
          "Only an admin can create a group chat room",
        );
      }
      // NOTE: deliberately NOT defaulting an unnamed room to
      // ChatService.DEFAULT_GROUP_ROOM_NAME — that name is reserved for the
      // one auto-provisioned default room (ensureVillageGroupRoom matches on
      // it by name); reusing it here for an admin-created extra room would
      // make it ambiguous which room "is" the default the next time
      // ensureVillageGroupRoom runs.
      const room = await tx.chatRoom.create({
        data: {
          villageId: claims.villageId,
          type: ChatRoomType.GROUP,
          name: dto.name ?? "กลุ่มใหม่",
          residentsCanPost: dto.residentsCanPost ?? false,
        },
      });
      await tx.chatParticipant.create({
        data: {
          villageId: claims.villageId,
          chatRoomId: room.id,
          userId: claims.userId,
        },
      });
      return room;
    }

    // DIRECT
    if (!dto.targetUserId) {
      throw new BadRequestException(
        "targetUserId is required for a DIRECT chat room",
      );
    }
    if (dto.targetUserId === claims.userId) {
      throw new BadRequestException("Cannot start a direct chat with yourself");
    }

    // RLS already scopes this lookup to the caller's own village — a
    // targetUserId from another village simply won't be found.
    const targetUser = await tx.user.findUnique({
      where: { id: dto.targetUserId },
    });
    if (!targetUser) {
      throw new NotFoundException("Target user not found");
    }

    // Spec 2.3: "แชท 1:1 ระหว่างลูกบ้าน-นิติบุคคล, ลูกบ้าน-รปภ." — a
    // resident<->admin/guard pair only (either side may initiate). Not
    // resident<->resident or admin<->guard — out of spec's literal AC, and
    // opening it up would need its own product decision this backlog item
    // doesn't make.
    const isResidentAdminOrGuardPair =
      (claims.role === "RESIDENT" &&
        (targetUser.role === "ADMIN" || targetUser.role === "GUARD")) ||
      (targetUser.role === "RESIDENT" &&
        (claims.role === "ADMIN" || claims.role === "GUARD"));
    if (!isResidentAdminOrGuardPair) {
      throw new BadRequestException(
        "Direct chat is only supported between a resident and an admin/guard",
      );
    }

    // Find-or-create. Note: a genuine race (two concurrent create calls for
    // the exact same pair) could create two DIRECT rooms — accepted risk for
    // this MVP (unlike MaintenanceTicketCounter's ticket numbering, nothing
    // in spec 2.3's AC requires this to be atomic, and the failure mode is
    // "occasionally two rooms instead of one", not a security/data issue).
    const existing = await tx.chatRoom.findFirst({
      where: {
        villageId: claims.villageId,
        type: ChatRoomType.DIRECT,
        participants: { some: { userId: claims.userId } },
        AND: { participants: { some: { userId: dto.targetUserId } } },
      },
      include: { participants: true },
    });
    if (existing && existing.participants.length === 2) {
      return existing;
    }

    return tx.chatRoom.create({
      data: {
        villageId: claims.villageId,
        type: ChatRoomType.DIRECT,
        participants: {
          create: [
            { villageId: claims.villageId, userId: claims.userId },
            { villageId: claims.villageId, userId: dto.targetUserId },
          ],
        },
      },
    });
  }

  /**
   * `PATCH /chat-rooms/:id` — ADMIN-only, GROUP rooms only. See
   * UpdateChatRoomDto's doc comment for why this endpoint exists beyond the
   * literal backlog checklist.
   */
  async updateRoom(
    chatRoomId: string,
    dto: UpdateChatRoomDto,
    claims: TenantClaims,
  ) {
    if (claims.role !== "ADMIN") {
      throw new ForbiddenException(
        "Only an admin can update a chat room's settings",
      );
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    const room = await tx.chatRoom.findUnique({ where: { id: chatRoomId } });
    if (!room) {
      throw new NotFoundException("Chat room not found");
    }
    if (room.type !== ChatRoomType.GROUP) {
      throw new BadRequestException(
        "Only GROUP rooms support residentsCanPost/name updates — a DIRECT room's " +
          "two participants can always post to each other.",
      );
    }

    return tx.chatRoom.update({
      where: { id: chatRoomId },
      data: {
        ...(dto.residentsCanPost !== undefined
          ? { residentsCanPost: dto.residentsCanPost }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
      },
    });
  }

  /** `GET /chat-rooms/:id/messages?page=&pageSize=` — archived history, newest first. */
  async getMessages(
    chatRoomId: string,
    claims: TenantClaims,
    page: number,
    pageSize: number,
  ) {
    const tx = getTenantPrismaClient<PrismaClient>();
    await this.assertMembership(tx, chatRoomId, claims.userId);

    const [items, total] = await Promise.all([
      tx.chatMessage.findMany({
        where: { chatRoomId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      tx.chatMessage.count({ where: { chatRoomId } }),
    ]);

    return { items, total, page, pageSize };
  }

  /** `PATCH /chat-rooms/:id/read` and the `mark_read` WS event share this. */
  async markRead(chatRoomId: string, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    await this.assertMembership(tx, chatRoomId, claims.userId);

    return tx.chatParticipant.update({
      where: { chatRoomId_userId: { chatRoomId, userId: claims.userId } },
      data: { lastReadAt: new Date() },
    });
  }

  /**
   * Persists a message. Called by both the WS `send_message` handler (the
   * primary path — real-time delivery) and could be reused by a future REST
   * fallback, though none is exposed today (PHASE2_BACKLOG.md Epic 8 only
   * asks for send via WS; REST is history/room-list/read/image-upload only).
   *
   * Enforces `ChatRoom.residentsCanPost` (spec 2.3: group room defaults to
   * admin-only broadcast) — GUARD and ADMIN can always post in a GROUP room;
   * only RESIDENT is gated by the flag. DIRECT rooms ignore the flag
   * entirely (both participants can always post there).
   */
  async sendMessage(
    chatRoomId: string,
    dto: { message?: string; imageUrl?: string },
    claims: TenantClaims,
  ) {
    if (!dto.message?.trim() && !dto.imageUrl) {
      throw new BadRequestException("message or imageUrl is required");
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    const room = await this.assertMembership(tx, chatRoomId, claims.userId);

    if (
      room.type === ChatRoomType.GROUP &&
      !room.residentsCanPost &&
      claims.role === "RESIDENT"
    ) {
      throw new ForbiddenException(
        "This group is broadcast-only; residents cannot post here",
      );
    }

    return tx.chatMessage.create({
      data: {
        villageId: claims.villageId,
        chatRoomId,
        senderId: claims.userId,
        message: dto.message?.trim() || undefined,
        imageUrl: dto.imageUrl,
      },
    });
  }

  /**
   * Image attachment upload (PHASE2_BACKLOG.md Epic 8: reuse
   * FileStorageService's general "entry-logs" bucket — chat photos aren't
   * ID-card-sensitive). Requires membership so a non-participant can't use
   * this endpoint to stash arbitrary uploads under someone else's room.
   */
  async attachImage(
    chatRoomId: string,
    photoDataUrl: string,
    claims: TenantClaims,
  ) {
    const tx = getTenantPrismaClient<PrismaClient>();
    await this.assertMembership(tx, chatRoomId, claims.userId);

    const imageUrl = await this.fileStorage.savePhoto(
      "entry-logs",
      claims.villageId,
      photoDataUrl,
    );
    return { imageUrl };
  }

  /**
   * Room-level authorization for the WS `join_room` event — exposed
   * separately from the private `assertMembership` so `ChatGateway` can
   * verify membership before calling `socket.join()`, without needing a
   * second DB round trip for message-sending afterward.
   */
  async assertCanJoin(
    chatRoomId: string,
    claims: TenantClaims,
  ): Promise<ChatRoom> {
    const tx = getTenantPrismaClient<PrismaClient>();
    return this.assertMembership(tx, chatRoomId, claims.userId);
  }
}
