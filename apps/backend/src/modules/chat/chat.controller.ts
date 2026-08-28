import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ChatService } from "./chat.service";
import { CreateChatRoomDto } from "./dto/create-chat-room.dto";
import { UpdateChatRoomDto } from "./dto/update-chat-room.dto";
import { UploadChatImageDto } from "./dto/upload-chat-image.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { perUserThrottle } from "../../common/throttle/per-user-throttle";

/**
 * Epic 8 — Chat (spec 2.3 / docs/PHASE2_BACKLOG.md Epic 8). REST surface is
 * deliberately limited to what doesn't belong on a WebSocket event: room
 * list/creation, archived message history (pagination, spec 2.3's "ประวัติ
 * แชทเก็บถาวร ค้นหาย้อนหลังได้"), the read-receipt update, and image
 * upload. Real-time send/receive/typing all go through ChatGateway instead
 * — see docs/ARCHITECTURE.md ADR-004/005.
 *
 * No class-level @Roles() — every authenticated role (RESIDENT/GUARD/ADMIN)
 * can use these endpoints; role-specific restrictions (GROUP creation is
 * ADMIN-only, residentsCanPost enforcement) are checked inside ChatService
 * because they depend on more than just the caller's role (e.g. which room,
 * which room's current residentsCanPost value).
 */
@Controller("chat-rooms")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  list(@CurrentUser() user: TenantClaims) {
    return this.chatService.listRooms(user);
  }

  @Post()
  create(@Body() dto: CreateChatRoomDto, @CurrentUser() user: TenantClaims) {
    return this.chatService.createRoom(dto, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateChatRoomDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.chatService.updateRoom(id, dto, user);
  }

  @Get(":id/messages")
  messages(
    @Param("id") id: string,
    @CurrentUser() user: TenantClaims,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
  ) {
    return this.chatService.getMessages(
      id,
      user,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 30)),
    );
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.chatService.markRead(id, user);
  }

  // Same per-user throttle shape as sos-alerts's trigger endpoint — cheap
  // protection against a client hammering the upload endpoint, without
  // being restrictive enough to block a legitimate multi-photo report.
  @Throttle(perUserThrottle(20, 60_000))
  @Post(":id/image")
  uploadImage(
    @Param("id") id: string,
    @Body() dto: UploadChatImageDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.chatService.attachImage(id, dto.photoDataUrl, user);
  }
}
