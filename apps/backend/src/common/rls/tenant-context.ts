import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";

/**
 * Claims decoded from the auth JWT (see spec 3.3: every JWT payload carries
 * village_id + role, plus user_id/house_id). Populated per-request by
 * TenantContextMiddleware.
 */
export interface TenantClaims {
  villageId: string;
  userId: string;
  role: "RESIDENT" | "GUARD" | "ADMIN";
  houseId?: string | null;
}

/**
 * Everything a request handler needs once it is inside the RLS-scoped
 * transaction: the tenant claims plus the transactional Prisma client that
 * already has `app.current_village_id` (etc.) SET LOCAL for this transaction.
 * Populated by RlsInterceptor, which runs *inside* the transaction opened
 * around the controller call.
 *
 * `tx` is typed as PrismaClient's transaction-callback param shape, but we
 * keep it as `unknown` here to avoid a circular import with PrismaService;
 * consumers should import `TenantPrismaClient` from prisma.service.ts instead.
 */
export interface TenantRequestContext extends TenantClaims {
  tx: unknown;
}

/**
 * Two separate AsyncLocalStorage instances on purpose:
 *  - `tenantClaimsStorage` is set very early, by middleware, before guards
 *    and interceptors run — guards (e.g. RolesGuard) only need the JWT
 *    claims, not a live transaction.
 *  - `tenantRequestStorage` is set later, by RlsInterceptor, once the
 *    transaction + SET LOCAL calls have actually happened — this is what
 *    services use to run Prisma queries that get RLS-filtered.
 *
 * Keeping them separate means a guard that runs before the interceptor
 * (per Nest's execution order: middleware -> guards -> interceptors ->
 * pipes -> handler) can still read villageId/role without needing a
 * transaction to exist yet.
 */
export const tenantClaimsStorage = new AsyncLocalStorage<TenantClaims>();
export const tenantRequestStorage =
  new AsyncLocalStorage<TenantRequestContext>();

export function getTenantClaims(): TenantClaims | undefined {
  return tenantRequestStorage.getStore() ?? tenantClaimsStorage.getStore();
}

/**
 * Services call this to get a Prisma client that is already scoped to the
 * current request's village via Postgres RLS (SET LOCAL app.current_village_id
 * was executed on the underlying transaction by RlsInterceptor).
 *
 * Throws if called outside of a request that went through RlsInterceptor
 * (e.g. a route not covered by the interceptor, or code called from a cron
 * job) — callers that legitimately need cross-tenant access must go through
 * PrismaService directly and say so explicitly, never fall back silently.
 */
export function getTenantPrismaClient<T = PrismaClient>(): T {
  const store = tenantRequestStorage.getStore();
  if (!store) {
    throw new Error(
      "getTenantPrismaClient() called outside of an RLS-scoped request context. " +
        "Every module service must run behind RlsInterceptor (applied globally in AppModule). " +
        "If this is intentionally cross-tenant/system code, use PrismaService directly instead.",
    );
  }
  return store.tx as T;
}
