import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { TransportProviderType } from "@prisma/client";

/**
 * Epic 10 — Transport Directory (spec 2.7 / PHASE2_BACKLOG.md Epic 10).
 * Admin-authored phone-book entry for a recommended motorcycle-taxi/taxi/van
 * driver — see schema.prisma's TransportProvider model doc comment for why
 * this is a flat CRUD shape (no booking/queue/location state).
 */
export class CreateTransportProviderDto {
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEnum(TransportProviderType)
  type!: TransportProviderType;

  // Same Thai-phone shape validated elsewhere in the codebase (e.g.
  // auth/dto/create-user.dto.ts, visitor-pass/dto/create-visitor-pass.dto.ts).
  @Matches(/^0\d{9}$/, {
    message: "phone must be a 10-digit Thai phone number starting with 0",
  })
  phone!: string;

  // Spec 2.7 groups "พื้นที่ให้บริการ/หมายเหตุ (เช่น ราคาโดยประมาณ)" as one
  // free-text field — see schema.prisma's TransportProvider.serviceArea.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceArea?: string;
}
