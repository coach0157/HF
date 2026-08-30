import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PatrolLogService } from "./patrol-log.service";
import { CreatePatrolLogDto } from "./dto/create-patrol-log.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { perUserThrottle } from "../../common/throttle/per-user-throttle";

/**
 * Epic 12 — Guard Patrol Log (user request, see docs/PHASE2_BACKLOG.md §5).
 */
@Controller("patrol-logs")
export class PatrolLogController {
  constructor(private readonly patrolLogService: PatrolLogService) {}

  @Roles("GUARD")
  // Same rationale as entry-log's create() throttle (spec 3.4-style abuse
  // guard for a compromised guard account): comfortably covers a real
  // patrol's pace while catching a flood of fake evidence photos.
  @Throttle(perUserThrottle(100, 60 * 60_000))
  @Post()
  create(@Body() dto: CreatePatrolLogDto, @CurrentUser() user: TenantClaims) {
    return this.patrolLogService.create(dto, user);
  }

  // ADMIN + every GUARD (not just the recording one) — RESIDENT never
  // reaches the service at all, RolesGuard rejects with 403 first.
  @Roles("ADMIN", "GUARD")
  @Get()
  list(
    @Query("date") date: string | undefined,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
  ) {
    return this.patrolLogService.list({
      date,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
    });
  }
}
