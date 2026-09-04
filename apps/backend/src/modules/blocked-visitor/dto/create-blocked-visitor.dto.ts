import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

/**
 * At least one of phone/vehiclePlate is required — not expressible with
 * class-validator's per-field decorators, so BlockedVisitorService.create()
 * enforces it (see that file).
 */
export class CreateBlockedVisitorDto {
  @IsOptional()
  @Matches(/^0\d{9}$/, {
    message: "phone must be a 10-digit Thai phone number starting with 0",
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
