import { IsString } from "class-validator";

/**
 * Epic 8 — Chat. Same base64-data-URL shape as
 * maintenance/dto/create-maintenance-ticket.dto.ts's `photoDataUrl` — no
 * multipart pipeline in this MVP (see FileStorageService's doc comment).
 * Returns a URL string the client then sends through the WS `send_message`
 * event as `imageUrl` (PHASE2_BACKLOG.md Epic 8: "Image upload endpoint...
 * คืน URL แล้วส่งผ่าน WS send_message พร้อม imageUrl").
 */
export class UploadChatImageDto {
  @IsString()
  photoDataUrl!: string;
}
