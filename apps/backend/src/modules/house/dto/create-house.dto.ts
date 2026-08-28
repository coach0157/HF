import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/**
 * Dev-agent addition (not in spec 3.3's literal endpoint list, which never
 * names a `/houses` resource explicitly even though `houses` is a core
 * table in spec 3.2's ER model). Without this, nothing in the system can
 * create a house record or let the Admin Dashboard look one up by id/zone —
 * blocking Epic 5's "จัดการสมาชิก: ... ผูกบ้านเลขที่" (assign a house number)
 * and the SOS dashboard's "แสดง ... เลขที่บ้าน" (spec 1.3/2.2), since
 * `sos_alerts`/`users` only carry a `house_id` FK, never a denormalized
 * house number. See house.module.ts for more.
 */
export class CreateHouseDto {
  @MinLength(1)
  @MaxLength(50)
  houseNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  zone?: string;

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

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}
