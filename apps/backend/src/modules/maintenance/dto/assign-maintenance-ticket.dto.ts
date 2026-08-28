import { IsDateString, MaxLength, MinLength } from "class-validator";

/**
 * Epic 9 — Maintenance (spec 2.4 / PHASE2_BACKLOG.md Epic 9).
 * `assignedTo` is deliberately free text, NOT a FK to `User` — see
 * schema.prisma's MaintenanceTicket.assignedTo comment and
 * docs/ARCHITECTURE.md §8 ("Phase 2 does not introduce a technician
 * role/login").
 */
export class AssignMaintenanceTicketDto {
  @MinLength(1)
  @MaxLength(200)
  assignedTo!: string;

  @IsDateString()
  scheduledDate!: string;
}
