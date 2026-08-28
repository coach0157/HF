import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { IsEnum } from "class-validator";
import { MaintenanceCategory } from "@prisma/client";

/**
 * Epic 9 — Maintenance (spec 2.4 / PHASE2_BACKLOG.md Epic 9).
 * `houseId`/`createdByUserId` are deliberately NOT fields here — they come
 * from the resident's own JWT claims in the service (spec 3.3: "ห้าม trust
 * village_id/house_id ที่ส่งมาจาก client เอง"), never from the request body.
 */
export class CreateMaintenanceTicketDto {
  @IsEnum(MaintenanceCategory)
  category!: MaintenanceCategory;

  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  // Base64 data URL, e.g. "data:image/jpeg;base64,...". Optional — spec 2.4
  // requires residents CAN attach a photo, not that every ticket must have
  // one. Routed to the general "entry-logs" bucket (not the sensitive-id
  // bucket) per PHASE2_BACKLOG.md Epic 9: "รูปงานซ่อมไม่ใช่บัตร ปชช.".
  @IsOptional()
  @IsString()
  photoDataUrl?: string;
}
