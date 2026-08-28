import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Body,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { EntryLogService } from "./entry-log.service";
import { CreateEntryLogDto } from "./dto/create-entry-log.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { perUserThrottle } from "../../common/throttle/per-user-throttle";

@Controller("entry-logs")
export class EntryLogController {
  constructor(private readonly entryLogService: EntryLogService) {}

  @Roles("GUARD")
  // Spec 3.4: "ป้องกัน รปภ. บัญชีถูกยึด สร้าง entry log ปลอมจำนวนมาก". 100/hour
  // comfortably covers a busy gate's real traffic while catching a
  // compromised-guard-account abuse pattern.
  @Throttle(perUserThrottle(100, 60 * 60_000))
  @Post()
  create(@Body() dto: CreateEntryLogDto, @CurrentUser() user: TenantClaims) {
    return this.entryLogService.create(dto, user);
  }

  // The critical "no auto-close" endpoint (spec 2.1) — only path that ever
  // sets exit_time. Guard OR the visited resident (ownership checked in the
  // service).
  @Roles("GUARD", "RESIDENT")
  @Patch(":id/confirm-exit")
  confirmExit(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.entryLogService.confirmExit(id, user);
  }

  // Guard/Admin oversight + Resident's own "ประวัติเข้า-ออก" screen (spec
  // 1.1) — residents are scoped to their own house_id in the service
  // regardless of what house_id they pass here.
  @Roles("GUARD", "ADMIN", "RESIDENT")
  @Get()
  list(
    @Query("house_id") houseId: string | undefined,
    @Query("date") date: string | undefined,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    // QA-flagged gap: mobile's ExitConfirmScreen was filtering "not yet
    // exited" client-side over a single pageSize=100 page, silently
    // dropping open visitors past the 100th when the gate's true open
    // count exceeds that. `exited=true`/`exited=false` pushes the
    // `exit_time IS NULL` filter into the DB query (see service's `list()`)
    // so it's correct against the real total, not just one page's worth.
    @Query("exited") exited: string | undefined,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.entryLogService.list(
      {
        houseId,
        date,
        page: Math.max(1, Number(page) || 1),
        pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
        exited: exited === undefined ? undefined : exited === "true",
      },
      user,
    );
  }

  // Single-record detail, including photo_url — the audit-logged "admin
  // views a sensitive photo" path (spec 3.4 requirement (b), see
  // entry-log.service.ts's findOne()).
  @Roles("GUARD", "ADMIN", "RESIDENT")
  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.entryLogService.findOne(id, user);
  }
}
