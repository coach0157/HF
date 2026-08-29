import { IsString } from "class-validator";

/**
 * Avatar upload feature (requested outside the original spec — a small,
 * self-contained addition to Epic 1's Users module). Same base64-data-URL
 * shape as every other photo upload in this MVP (see
 * FileStorageService's doc comment for why: no multipart/S3 pipeline yet).
 * Format (must be data:image/...) and size are both validated in
 * UsersService.updateAvatar(), not here — class-validator has no built-in
 * "decoded base64 byte size" check, and the format check needs to produce a
 * specific error message distinguishing "not a data URL" from "unsupported
 * image type".
 */
export class UpdateAvatarDto {
  @IsString()
  photoDataUrl!: string;
}
