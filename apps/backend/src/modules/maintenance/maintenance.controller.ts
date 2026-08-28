import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { MaintenanceCategory, MaintenanceStatus } from "@prisma/client";
import { MaintenanceService } from "./maintenance.service";
import { CreateMaintenanceTicketDto } from "./dto/create-maintenance-ticket.dto";
import { AssignMaintenanceTicketDto } from "./dto/assign-maintenance-ticket.dto";
import { UpdateMaintenanceTicketStatusDto } from "./dto/update-maintenance-ticket-status.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";

/**
 * Epic 9 — Maintenance (spec 2.4 / PHASE2_BACKLOG.md Epic 9). No @Roles() on
 * this class-level — GUARD never appears on any route here; maintenance is a
 * resident<->admin concern only per spec 2.4.
 */
@Controller("maintenance-tickets")
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Roles("RESIDENT")
  @Post()
  create(
    @Body() dto: CreateMaintenanceTicketDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.maintenanceService.create(dto, user);
  }

  // Resident (own house only, scoped in the service) + Admin (whole village).
  @Roles("RESIDENT", "ADMIN")
  @Get()
  list(
    @CurrentUser() user: TenantClaims,
    @Query("status") status: MaintenanceStatus | undefined,
    @Query("category") category: MaintenanceCategory | undefined,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
  ) {
    return this.maintenanceService.list(
      {
        status,
        category,
        page: Math.max(1, Number(page) || 1),
        pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      },
      user,
    );
  }

  @Roles("RESIDENT", "ADMIN")
  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.maintenanceService.findOne(id, user);
  }

  @Roles("ADMIN")
  @Patch(":id/assign")
  assign(
    @Param("id") id: string,
    @Body() dto: AssignMaintenanceTicketDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.maintenanceService.assign(id, dto, user);
  }

  @Roles("ADMIN")
  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateMaintenanceTicketStatusDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.maintenanceService.updateStatus(id, dto, user);
  }
}
