import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { VisitorPassUsageType } from "@prisma/client";

export class CreateVisitorPassDto {
  @MinLength(1)
  @MaxLength(200)
  visitorName!: string;

  @IsOptional()
  @Matches(/^0\d{9}$/, {
    message:
      "visitorPhone must be a 10-digit Thai phone number starting with 0",
  })
  visitorPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehiclePlate?: string;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validTo!: string;

  @IsEnum(VisitorPassUsageType)
  usageType!: VisitorPassUsageType;
}
