import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { TenantClaims } from "../rls/tenant-context";
import { getTenantClaims } from "../rls/tenant-context";

/**
 * Enforces @Roles(...) metadata. Runs after JwtAuthGuard (Nest evaluates
 * guards in array order — see CommonModule for APP_GUARD registration
 * order), so `getTenantClaims()` is guaranteed to be set for any route that
 * reaches this guard and isn't @Public().
 *
 * Routes with no @Roles() decorator are allowed for any authenticated role
 * — apply @Roles() explicitly wherever the spec restricts an endpoint to a
 * specific role (e.g. POST /visitor-passes is resident-only, PATCH
 * /sos-alerts/:id/acknowledge is guard-only, POST /announcements is
 * admin-only — see spec 3.3).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      TenantClaims["role"][]
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const claims = getTenantClaims();
    if (!claims || !requiredRoles.includes(claims.role)) {
      throw new ForbiddenException(
        `Requires one of roles: ${requiredRoles.join(", ")}`,
      );
    }
    return true;
  }
}
