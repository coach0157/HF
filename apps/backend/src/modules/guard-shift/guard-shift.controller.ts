import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { GuardShiftStatus } from "@prisma/client";
import { GuardShiftService } from "./guard-shift.service";
import { CreateGuardShiftDto } from "./dto/create-guard-shift.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";

@Controller("guard-shifts")
export class GuardShiftController {
  constructor(private readonly guardShiftService: GuardShiftService) {}

  @Roles("GUARD", "ADMIN")
  @Post()
  start(@Body() dto: CreateGuardShiftDto, @CurrentUser() user: TenantClaims) {
    return this.guardShiftService.start(dto, user);
  }

  @Roles("GUARD", "ADMIN")
  @Patch(":id")
  end(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.guardShiftService.end(id, user);
  }

  // Admin roster view (backlog Epic 5: "หน้าจัดการ guard shift").
  @Roles("ADMIN")
  @Get()
  list(
    @Query("status") status?: GuardShiftStatus,
    @Query("guardUserId") guardUserId?: string,
  ) {
    return this.guardShiftService.list({ status, guardUserId });
  }
}
