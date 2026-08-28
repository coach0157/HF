import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { getTenantClaims } from "../rls/tenant-context";

/**
 * Pulls the decoded JWT claims (village_id, user_id, role, house_id) for
 * the current request. Use in controllers instead of poking at
 * `req.user` directly, e.g.:
 *
 *   @Get('me')
 *   me(@CurrentUser() user: TenantClaims) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext) => {
    return getTenantClaims();
  },
);
