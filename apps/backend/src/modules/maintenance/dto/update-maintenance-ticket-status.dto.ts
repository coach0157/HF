import { IsEnum } from "class-validator";
import { MaintenanceStatus } from "@prisma/client";

/**
 * Epic 9 — Maintenance (spec 2.4 / PHASE2_BACKLOG.md Epic 9). The DTO
 * accepts the full `MaintenanceStatus` enum (not just DONE) so a bad request
 * gets a clear class-validator 400 for a nonsense value — the actual
 * forward-only transition rule (see maintenance.service.ts's
 * `updateStatus()`) is enforced in the service, not here.
 */
export class UpdateMaintenanceTicketStatusDto {
  @IsEnum(MaintenanceStatus)
  status!: MaintenanceStatus;
}
