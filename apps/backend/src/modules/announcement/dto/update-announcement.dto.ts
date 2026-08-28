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

/**
 * Dev-agent addition — see announcement.controller.ts's PATCH endpoint doc
 * comment. Partial of CreateAnnouncementDto; every field optional since a
 * caller may only want to change e.g. the level.
 */
export class UpdateAnnouncementDto {
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsEnum(AnnouncementLevel)
  level?: AnnouncementLevel;

  @IsOptional()
  @IsEnum(AnnouncementTargetScope)
  targetScope?: AnnouncementTargetScope;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetZone?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  targetHouseIds?: string[];

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
