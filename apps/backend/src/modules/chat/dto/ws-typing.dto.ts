import { IsUUID } from "class-validator";

/**
 * Epic 8 — Chat. Payload for the `typing` WS event. Ephemeral — never
 * persisted (PHASE2_BACKLOG.md Epic 8: "typing (optional, ephemeral ไม่
 * persist)") — just re-broadcast to the room.
 */
export class WsTypingDto {
  @IsUUID()
  chatRoomId!: string;
}
