import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { TransportProviderType } from "@prisma/client";

/**
 * Partial of CreateTransportProviderDto plus `isActive` — the same PATCH
 * endpoint handles both "แก้ไข" (edit any field) and "เปิด-ปิดการแสดงผล"
 * (toggle active), matching announcement.controller.ts's PATCH pattern
 * (update-announcement.dto.ts) rather than a separate toggle endpoint, since
 * spec 2.7 doesn't require them to be distinct routes — only distinct from
 * DELETE (see transport-provider.controller.ts).
 */
export class UpdateTransportProviderDto {
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(TransportProviderType)
  type?: TransportProviderType;

  @IsOptional()
  @Matches(/^0\d{9}$/, {
    message: "phone must be a 10-digit Thai phone number starting with 0",
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceArea?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
