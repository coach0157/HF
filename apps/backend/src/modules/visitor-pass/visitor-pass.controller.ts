import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { VisitorPassService } from "./visitor-pass.service";
import { CreateVisitorPassDto } from "./dto/create-visitor-pass.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { perUserThrottle } from "../../common/throttle/per-user-throttle";

@Controller("visitor-passes")
export class VisitorPassController {
  constructor(private readonly visitorPassService: VisitorPassService) {}

  @Roles("RESIDENT")
  // Spec 3.4: "จำกัดอัตราการสร้าง QR ... ป้องกันการสร้าง QR จำนวนมากผิดปกติจาก
  // บัญชีเดียว (บ่งชี้บัญชีถูกขโมย)". 30/hour is generous for legitimate use
  // (a resident inviting several guests/riders in a day) but catches a
  // compromised-account QR-farming pattern.
  @Throttle(perUserThrottle(30, 60 * 60_000))
  @Post()
  create(@Body() dto: CreateVisitorPassDto, @CurrentUser() user: TenantClaims) {
    return this.visitorPassService.create(dto, user);
  }

  // Owner-or-admin (checked in the service, since admin-revoking-someone-
  // else's-pass is a distinct, audit-logged path — see visitor-pass.service.ts).
  @Roles("RESIDENT", "ADMIN")
  @Patch(":id/revoke")
  revoke(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.visitorPassService.revoke(id, user);
  }

  // Stub for the future offline Guard app revocation sync (spec 3.4) — see
  // visitor-pass.service.ts's listRevokedSince() doc comment for the known
  // `since` limitation. Static path registered before ':token' so it can
  // never be shadowed by the dynamic route (Nest matches by segment count
  // anyway, but this ordering keeps intent obvious).
  @Roles("GUARD")
  @Get("sync/revoked")
  syncRevoked(@Query("since") since?: string) {
    return this.visitorPassService.listRevokedSince(since);
  }

  // Guard's scan screen (spec 1.2). Deliberately Guard-role-only and NOT
  // @Public() — the visitor never calls this API directly, the Guard app
  // does, authenticated as a Guard. See visitor-pass.module.ts's original
  // TODO for why this is not the "path สแกน QR ของแขก" spec 3.3 exempts
  // from auth.
  @Roles("GUARD")
  @Get(":token")
  scan(@Param("token") token: string, @CurrentUser() user: TenantClaims) {
    return this.visitorPassService.scanDetails(token, user);
  }
}
