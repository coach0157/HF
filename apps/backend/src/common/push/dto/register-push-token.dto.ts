import { IsString, MaxLength, MinLength } from "class-validator";

/**
 * `POST /push-tokens` / `DELETE /push-tokens` (Epic 11, PHASE2_BACKLOG.md).
 * Deliberately only validated as a non-empty string here — the real
 * "is this actually a well-formed Expo push token" check happens in
 * `PushTokenService` via `Expo.isExpoPushToken()`, which is the one true
 * source for that format rule (no need to duplicate/approximate it with a
 * regex here too).
 */
export class RegisterPushTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  expoPushToken!: string;
}
