import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { AnnouncementLevel, AnnouncementTargetScope } from "@prisma/client";

export class CreateAnnouncementDto {
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @MinLength(1)
  content!: string;

  @IsEnum(AnnouncementLevel)
  level!: AnnouncementLevel;

  @IsEnum(AnnouncementTargetScope)
  targetScope!: AnnouncementTargetScope;

  // Required (validated in the service, since it's conditional on
  // targetScope) when targetScope = ZONE — matches a house's `zone` string.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetZone?: string;

  // Required when targetScope = HOUSE — see schema.prisma's
  // AnnouncementTarget model (a Dev-agent schema addition; spec 3.2's ER
  // has no join table for "which house(s)").
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  targetHouseIds?: string[];

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
