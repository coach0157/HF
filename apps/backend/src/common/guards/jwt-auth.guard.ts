import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { getTenantClaims } from '../rls/tenant-context';

/**
 * Rejects any request that doesn't carry a validly-signed JWT, UNLESS the
 * route handler (or its controller) is annotated with @Public().
 *
 * By the time this guard runs, TenantContextMiddleware has already tried to
 * decode the Bearer token into AsyncLocalStorage — this guard just checks
 * whether that succeeded. Register globally (APP_GUARD in CommonModule) so
 * new modules are protected by default and must opt OUT via @Public()
 * rather than opt in — safer default for a system handling PDPA-sensitive
 * data (spec 3.4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const claims = getTenantClaims();
    if (!claims) {
      throw new UnauthorizedException('Missing or invalid access token');
    }
    return true;
  }
}
