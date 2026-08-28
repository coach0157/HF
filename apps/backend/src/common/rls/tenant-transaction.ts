import type { PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantClaims, tenantRequestStorage } from "./tenant-context";

/**
 * ADR-005 (docs/ARCHITECTURE.md §8.2, point 3) — the transaction-open +
 * `SET LOCAL app.current_village_id/current_user_id/current_role` sequence
 * that used to live only inside `RlsInterceptor` (see that file's own doc
 * comment for the full reasoning on why `SET LOCAL`, not plain `SET`).
 *
 * Extracted here so it has exactly ONE implementation, shared by:
 *  - `RlsInterceptor` (HTTP, one call per request)
 *  - `WsRlsInterceptor` (WebSocket, one call per `@SubscribeMessage` event —
 *    see src/common/rls/ws-rls.interceptor.ts)
 *
 * This is the whole point of ADR-005's shared-helper requirement: a second,
 * separately-maintained copy of this three-line sequence directly inside
 * `ChatGateway` would reintroduce exactly the class of bug centralized RLS
 * setup was built to make impossible — "one missed SET LOCAL line in one
 * code path, one cross-tenant leak." One helper, N callers (currently 2),
 * is the only version of this that keeps that guarantee as more transports
 * (HTTP today, WS now, maybe something else later) are added.
 *
 * `fn` runs with `tenantRequestStorage` populated (claims + the transaction
 * client `tx`), so anything `fn` calls — a controller handler, a WS handler,
 * or any service they call — can use `getTenantPrismaClient()` to get a
 * Postgres session where RLS is actively filtering by
 * `app.current_village_id`.
 */
export async function runInTenantTransaction<T>(
  prisma: PrismaService,
  claims: TenantClaims,
  fn: () => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_village_id', ${claims.villageId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${claims.userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_role', ${claims.role}, true)`;

    return tenantRequestStorage.run({ ...claims, tx: tx }, fn);
  });
}
