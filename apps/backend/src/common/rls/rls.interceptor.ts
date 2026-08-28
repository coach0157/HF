import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, from } from "rxjs";
import { lastValueFrom } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import { tenantClaimsStorage } from "./tenant-context";
import { runInTenantTransaction } from "./tenant-transaction";

/**
 * Step 2 of the multi-tenant RLS pattern (step 1 is TenantContextMiddleware).
 * Registered globally via APP_INTERCEPTOR in CommonModule, so it wraps every
 * controller handler in the app.
 *
 * For any request that has tenant claims (set by the middleware), this opens
 * a Prisma interactive transaction and, as the FIRST statement inside it,
 * runs:
 *
 *   SELECT set_config('app.current_village_id', $1, true)
 *
 * `set_config(..., true)` == `SET LOCAL` — the setting is scoped to this one
 * transaction and is automatically reset when the transaction commits or
 * rolls back. This is deliberate and important: Prisma (like most ORMs)
 * uses a connection pool, so a plain `SET app.current_village_id = ...`
 * (session-level, not LOCAL) would leak into whichever *other* request
 * happens to reuse that same pooled connection next — a serious cross-tenant
 * data leak. SET LOCAL inside a transaction cannot leak this way.
 *
 * The controller handler (and everything it calls) then runs *inside* that
 * same transaction — via `runInTenantTransaction()` (see
 * `common/rls/tenant-transaction.ts`, extracted per ADR-005 so the WebSocket
 * gateway can share this exact sequence instead of hand-rolling its own) —
 * so every Prisma query issued via `getTenantPrismaClient()` executes
 * against a Postgres session where the RLS policies in
 * apps/backend/prisma/sql/rls-policies.sql are actively filtering rows to
 * `village_id = current_setting('app.current_village_id')::uuid`.
 *
 * Trade-off (documented in docs/ARCHITECTURE.md ADR-002): every request that
 * touches the DB now holds one transaction (and one pooled connection) for
 * its full duration, including any awaited external calls (FCM push, SMS,
 * S3 upload) a handler makes mid-transaction. For MVP traffic this is fine
 * and buys strong correctness guarantees; if a module needs to make slow
 * external calls, prefer doing the DB read/write first, closing the
 * transaction, THEN making the external call — don't hold the transaction
 * open across a slow network call. Revisit if connection pool exhaustion
 * shows up under load.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const claims = tenantClaimsStorage.getStore();

    if (!claims) {
      // Public route (no verified JWT) — nothing to scope. Runs against the
      // base (non-transactional) PrismaService if the handler needs it,
      // e.g. /auth/login looking up a user by phone across the whole table
      // before a village is known.
      return next.handle();
    }

    return from(
      runInTenantTransaction(this.prisma, claims, () =>
        lastValueFrom(next.handle()),
      ),
    );
  }
}
