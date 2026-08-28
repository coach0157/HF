import { IsUUID } from "class-validator";

/** Epic 8 — Chat. Payload for the `join_room` WS event. */
export class WsJoinRoomDto {
  @IsUUID()
  chatRoomId!: string;
}
