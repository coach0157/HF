import { IsNumber, IsOptional, Max, Min } from "class-validator";

/**
 * `house_id` is deliberately NOT a client-supplied field — like `village_id`
 * (spec 3.3), the triggering resident's house is trusted only from their JWT
 * claims (`claims.houseId`), never from the request body. Only the GPS
 * coordinates (spec 2.2: "ส่งพิกัด GPS + เลขที่บ้าน") come from the client,
 * since only the device knows its own location.
 */
export class CreateSosAlertDto {
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
