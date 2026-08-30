import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/**
 * Epic 12 — Guard Patrol Log (user request, not in original spec, see
 * docs/PHASE2_BACKLOG.md §5). `villageId`/`guardUserId` are deliberately NOT
 * fields here — they come from the recording guard's own JWT claims in the
 * service (same "never trust from client" rule as every other module, spec
 * 3.3), never from the request body. `note`/`latitude`/`longitude` are all
 * optional per the epic's AC — there is no fixed checkpoint list, so nothing
 * about a patrol photo is required beyond the photo itself.
 */
export class CreatePatrolLogDto {
  // Base64 data URL, e.g. "data:image/jpeg;base64,...". Required — a patrol
  // log with no photo has no evidentiary value (the whole point of the
  // feature per its user story). Routed to the dedicated "patrol-logs"
  // bucket (see file-storage.service.ts), not the shared "entry-logs" one.
  @IsString()
  photoDataUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
