import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { ChatRoomType } from "@prisma/client";

/**
 * Epic 8 — Chat (spec 2.3 / PHASE2_BACKLOG.md Epic 8).
 *
 * `type: DIRECT` — find-or-create a 1:1 room between the caller and
 * `targetUserId` (resident<->admin or resident<->guard only; see
 * ChatService.createRoom for the pair validation). `targetUserId` is
 * required, `name`/`residentsCanPost` are ignored.
 *
 * `type: GROUP` — ADMIN-only. Creates a new, ADDITIONAL group room (`name`
 * optional, defaults to "กลุ่มใหม่" — deliberately NOT the same name as the
 * auto-provisioned default room, see ChatService.ensureVillageGroupRoom;
 * `residentsCanPost` optional,
 * defaults to false per spec 2.3's "broadcast แบบ read-only จากแอดมิน" being
 * the safer, spec-first-listed default — see schema.prisma's
 * ChatRoom.residentsCanPost comment). `targetUserId` is ignored.
 * Note: every village already gets one GROUP room lazy-created on first
 * `GET /chat-rooms` call (see ChatService.ensureVillageGroupRoom) — this
 * endpoint is for an admin who explicitly wants an *additional* group room
 * beyond that default one.
 */
export class CreateChatRoomDto {
  @IsEnum(ChatRoomType)
  type!: ChatRoomType;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  residentsCanPost?: boolean;
}
