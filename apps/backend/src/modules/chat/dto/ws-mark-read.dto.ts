import { IsUUID } from "class-validator";

/** Epic 8 — Chat. Payload for the `mark_read` WS event. */
export class WsMarkReadDto {
  @IsUUID()
  chatRoomId!: string;
}
