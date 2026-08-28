import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { PushTokenService } from "./push-token.service";
import { RegisterPushTokenDto } from "./dto/register-push-token.dto";
import { Roles } from "../decorators/roles.decorator";
import { CurrentUser } from "../decorators/current-user.decorator";
import type { TenantClaims } from "../rls/tenant-context";

/**
 * Epic 11 — Push Notifications (docs/ARCHITECTURE.md ADR-006,
 * PHASE2_BACKLOG.md Epic 11's "Implementation Tasks — Backend" list):
 * `POST /push-tokens` (register — called by `apps/mobile`'s
 * `lib/push.ts` right after login/session-restore) and `DELETE
 * /push-tokens` (unregister — called at logout so a device that logged out
 * doesn't keep receiving push for whichever account logs in next on the
 * same phone). `userId` is always the caller's own JWT claim, never a body
 * field — see `PushTokenService`'s doc comments.
 */
@Controller("push-tokens")
export class PushController {
  constructor(private readonly pushTokenService: PushTokenService) {}

  @Roles("RESIDENT", "GUARD", "ADMIN")
  @Post()
  register(
    @Body() dto: RegisterPushTokenDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.pushTokenService.registerToken(user, dto.expoPushToken);
  }

  @Roles("RESIDENT", "GUARD", "ADMIN")
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(
    @Body() dto: RegisterPushTokenDto,
    @CurrentUser() user: TenantClaims,
  ): Promise<void> {
    await this.pushTokenService.removeToken(user, dto.expoPushToken);
  }
}
