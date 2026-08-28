import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/**
 * Epic 8 — Chat. Payload for the `send_message` WS event. At least one of
 * `message`/`imageUrl` must be present — enforced in ChatService.sendMessage
 * (class-validator can't easily express "at least one of two optional
 * fields" without a custom validator, and this codebase doesn't have one
 * yet, so the check is a plain BadRequestException in the service, same
 * style as other cross-field checks elsewhere in this codebase e.g.
 * maintenance's forward-only status guard).
 */
export class WsSendMessageDto {
  @IsUUID()
  chatRoomId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  // Not validated as a URL — this codebase's FileStorageService returns
  // `local://bucket/village/file` refs, not real HTTP URLs (see its doc
  // comment), so `@IsUrl()` would reject legitimate values.
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
