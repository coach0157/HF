import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { NextFunction, Request, Response } from "express";
import { tenantClaimsStorage, TenantClaims } from "./tenant-context";

/**
 * Step 1 of the multi-tenant RLS pattern (see docs/ARCHITECTURE.md for the
 * full write-up). Applied to every route via AppModule.configure().
 *
 * Decodes the Bearer JWT (issued by POST /auth/login, see spec 3.3 — payload
 * carries village_id, role, user_id, house_id) and publishes those claims
 * into an AsyncLocalStorage context that survives for the rest of this
 * request's async call chain (guards, RlsInterceptor, controller, services).
 *
 * Deliberately does NOT reject the request on a missing/invalid token —
 * that is JwtAuthGuard's job (auth vs. authz stay separate). Public routes
 * (POST /auth/login, POST /auth/refresh, and the visitor QR scan lookup
 * GET /visitor-passes/:token which is read by a guard's own JWT, not the
 * visitor's) simply run with no tenant claims in context, and RlsInterceptor
 * skips the transaction-wrapping step for those.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const claims = await this.tryDecodeClaims(req);

    if (!claims) {
      next();
      return;
    }

    // Everything downstream (guards, RlsInterceptor, controllers, services)
    // executes inside this callback's async context, so tenantClaimsStorage
    // .getStore() resolves correctly anywhere further down the chain.
    tenantClaimsStorage.run(claims, () => next());
  }

  private async tryDecodeClaims(
    req: Request,
  ): Promise<TenantClaims | undefined> {
    const authHeader = req.headers.authorization;
    let token: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length);
    } else if (
      // NOTE: `req.path` is NOT usable here — this middleware is mounted via
      // `consumer.apply(...).forRoutes('*')` (AppModule.configure()), which
      // Express treats as a path-prefixed mount matching the ENTIRE request
      // path, so `req.path`/`req.url` inside it are rewritten relative to
      // that mount point and always read "/" regardless of the real
      // request. `req.originalUrl` is unaffected by that rewriting and still
      // carries the real path.
      req.originalUrl.split("?")[0].startsWith("/files/") &&
      typeof req.query.token === "string"
    ) {
      // GET /files/:bucket/:villageId/:filename (src/common/files/) is
      // rendered via <img src>/RN <Image> on both clients, neither of which
      // can attach a custom Authorization header to the request they fire
      // internally. Scoped to this one route (not accepted anywhere else)
      // to avoid widening every endpoint's attack surface to token-in-URL
      // (server/proxy access logs, browser history) — validated by the
      // exact same JwtService.verifyAsync() call as the header path below.
      token = req.query.token;
    }

    if (!token) {
      return undefined;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        villageId: string;
        role: TenantClaims["role"];
        houseId?: string | null;
      }>(token, {
        secret: this.configService.get<string>("JWT_ACCESS_SECRET"),
      });

      return {
        userId: payload.sub,
        villageId: payload.villageId,
        role: payload.role,
        houseId: payload.houseId ?? null,
      };
    } catch (err) {
      // Invalid/expired token: leave claims undefined. JwtAuthGuard will
      // reject the request with 401 for routes that require auth.
      this.logger.debug(`JWT verification failed: ${(err as Error).message}`);
      return undefined;
    }
  }
}
