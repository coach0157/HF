import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * `PATCH /chat-rooms/:id` — ADMIN-only. Not explicitly itemized in
 * PHASE2_BACKLOG.md Epic 8's backend task checklist (which only lists
 * POST/GET for chat-rooms), but the spec 2.3 AC it maps to
 * ("แอดมินตั้งค่าเปิดให้ลูกบ้านโพสต์ได้ต่อห้อง") needs SOME way to flip
 * `residentsCanPost` on a room that already exists — `POST /chat-rooms`
 * only ever creates a brand-new GROUP room, it can't be used to toggle the
 * flag on the village's existing default group room. Dev-agent decision:
 * a small dedicated PATCH endpoint, restricted to GROUP rooms only (a
 * DIRECT room's two participants can always post; the field is meaningless
 * there — see schema.prisma's ChatRoom.residentsCanPost comment).
 */
export class UpdateChatRoomDto {
  @IsOptional()
  @IsBoolean()
  residentsCanPost?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
