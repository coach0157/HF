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

  // QA-flagged gap (mobile Dev-agent round, GuardHomeScreen): a guard had no
  // way to read their own current shift status — GET /guard-shifts (list)
  // below is ADMIN-only, so a killed-and-reopened app fell back to a
  // locally-remembered (and therefore stale/wrong) on/off-duty toggle.
  // GUARD-only, always scoped to the caller's own guardUserId — never takes
  // a guardUserId param, so a guard can never read another guard's shift
  // status this way. Registered before the admin `list()` route only for
  // readability; Nest's routing isn't order-sensitive here since "me" is a
  // static segment matched at the controller's base path, not ":id".
  //
  // Response is wrapped as `{ shift: GuardShift | null }` rather than
  // returning the bare value — Nest/Express's RouterResponseController
  // treats a raw `null`/`undefined` controller return as "no body" (calls
  // `response.send()` with nothing, via `isNil(body)` in
  // express-adapter.js's `reply()`), so a caller with no open shift would
  // get an EMPTY response body, not the JSON literal `null`. Wrapping in an
  // object sidesteps that entirely: the response is always a valid JSON
  // object, `body.shift` is `null` when off duty.
  @Roles("GUARD")
  @Get("me/current")
  async getCurrent(@CurrentUser() user: TenantClaims) {
    const shift = await this.guardShiftService.getCurrentForGuard(user);
    return { shift };
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
