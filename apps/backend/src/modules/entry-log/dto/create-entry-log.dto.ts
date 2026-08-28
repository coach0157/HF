import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Two shapes in one DTO, disambiguated by whether `qrToken` is present (spec
 * 2.1 / entry-log.module.ts TODO: "(a) from a scanned visitor-pass token ...
 * (b) manual entry (no QR)"):
 *  - QR path: only `qrToken` (+ optional `photoDataUrl` for a face/gate
 *    snapshot) is used; `visitorName`/`vehiclePlate`/`houseId` are taken
 *    from the resolved pass, not from the client.
 *  - Manual path: `qrToken` omitted; `visitorName`, `houseId`, and
 *    `photoDataUrl` (ID card/plate photo) are required — enforced in
 *    entry-log.service.ts, not here, since the requirement is conditional.
 */
export class CreateEntryLogDto {
  @IsOptional()
  @IsString()
  qrToken?: string;

  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  visitorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehiclePlate?: string;

  @IsOptional()
  @IsUUID()
  houseId?: string;

  // Base64 data URL, e.g. "data:image/jpeg;base64,...". QR path: optional
  // gate/face photo -> S3_BUCKET_ENTRY_LOGS. Manual path: required ID
  // card/plate photo -> S3_BUCKET_SENSITIVE_ID (see file-storage.service.ts).
  @IsOptional()
  @IsString()
  photoDataUrl?: string;
}
