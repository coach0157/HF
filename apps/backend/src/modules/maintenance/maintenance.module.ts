import { Module } from "@nestjs/common";
import { MaintenanceController } from "./maintenance.controller";
import { MaintenanceService } from "./maintenance.service";

/**
 * Epic 9 — Maintenance (spec 2.4 / PHASE2_BACKLOG.md Epic 9). Depends only on
 * FileStorageService (provided globally via CommonModule, same as
 * entry-log's use of it) — no cross-module imports needed.
 */
@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
