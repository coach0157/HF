import { Injectable, Logger } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Expo } from "expo-server-sdk";
import { PrismaService } from "../prisma/prisma.service";
import { getTenantPrismaClient } from "../rls/tenant-context";
import type { TenantClaims } from "../rls/tenant-context";
import { runInTenantTransaction } from "../rls/tenant-transaction";

export interface PushTokenRecord {
  userId: string;
  expoPushToken: string;
}

/**
 * Epic 11 (docs/ARCHITECTURE.md ADR-006 §9.1/§9.2, PHASE2_BACKLOG.md
 * Epic 11) — CRUD over `PushToken`.
 *
 * `registerToken`/`removeToken` run inside the normal RLS-scoped request
 * transaction (same pattern as every other tenant write, via
 * `getTenantPrismaClient()`) — they're only ever called from
 * `POST /push-tokens` / `DELETE /push-tokens`, both authenticated HTTP
 * requests.
 *
 * `listTokensForUsers`/`removeTokenByValue` are called from
 * `PushNotificationService.send()`, which ADR-006 requires to be
 * fire-and-forget and NOT awaited by any request handler — by the time that
 * background work actually runs, the request that triggered it may have
 * already returned and closed its own RLS transaction, so that request's
 * `tx` is not a safe thing to depend on.
 *
 * BUG FOUND LIVE IN THIS SESSION (not caught by any of the 47+ mocked-Prisma
 * unit/e2e tests written for Epic 11 — mocks don't enforce real RLS, so
 * nothing exercised this path against actual Postgres): these two methods
 * used to query through the raw `PrismaService` on the theory that it
 * "bypasses RLS outside a transaction". It does NOT — `PrismaService`
 * connects as the same `village_app` role as everything else (see
 * apps/backend/prisma/sql/rls-policies.sql's `FORCE ROW LEVEL SECURITY`),
 * which silently returns ZERO rows for any query that never set
 * `app.current_village_id` — this is the exact same wrong assumption
 * `auth.service.ts`'s cross-village phone lookup made and had to be fixed
 * for (see `village_app_auth_lookup`'s migration comment). Every real push
 * trigger (announcement/SOS/chat/entry-log) resolved zero tokens and
 * silently no-opped, while manual testing against a token value obtained
 * directly (bypassing this lookup) worked fine — that mismatch is what
 * exposed the bug. Fixed by using `runInTenantTransaction()` (ADR-005) to
 * open a fresh, self-contained transaction and set tenant context before
 * querying, same as any other system code operating outside a request's own
 * transaction (`prisma/seed.ts` uses the identical pattern by hand).
 * `userIds` is still a trusted, already-authorized id list (every caller
 * resolved it from its own RLS-scoped query before calling `send()`) —
 * `claims` here is only to establish which village's RLS context to run
 * the query under, not to re-authorize the id list.
 */
@Injectable()
export class PushTokenService {
  private readonly logger = new Logger(PushTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert on `@@unique([userId, expoPushToken])` (ADR-006 §9.1) — a
   * re-login on the same device re-registers the same token instead of
   * accumulating duplicate rows. `userId`/`villageId` always come from the
   * caller's own JWT claims, never from request body, so a user can only
   * ever register a token for themselves.
   */
  async registerToken(claims: TenantClaims, expoPushToken: string) {
    if (!Expo.isExpoPushToken(expoPushToken)) {
      throw new BadRequestException(
        "expoPushToken is not a valid Expo push token",
      );
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.pushToken.upsert({
      where: {
        userId_expoPushToken: { userId: claims.userId, expoPushToken },
      },
      update: {},
      create: {
        villageId: claims.villageId,
        userId: claims.userId,
        expoPushToken,
      },
    });
  }

  /**
   * `DELETE /push-tokens` at logout — only ever removes the CALLER's own
   * token (never another user's), same "userId always from claims, never
   * from the body" rule as `registerToken`. A no-op (not a 404) if the
   * token was never registered / already removed.
   */
  async removeToken(claims: TenantClaims, expoPushToken: string): Promise<void> {
    const tx = getTenantPrismaClient<PrismaClient>();
    await tx.pushToken.deleteMany({
      where: { userId: claims.userId, expoPushToken },
    });
  }

  /**
   * Batch lookup for `PushNotificationService.send()` — every one of the
   * four triggers already resolves a recipient *list* (routedToGuardUserIds,
   * recipientUserIds, etc.), never a single user, so this is always called
   * with an array. Uses the raw `PrismaService`, not RLS — see class doc
   * comment. Row-level tenant isolation isn't needed here either way: every
   * caller already resolved `userIds` from its own RLS-scoped query before
   * calling `send()`, so this is a trusted, already-authorized id list, not
   * raw user input.
   */
  async listTokensForUsers(
    userIds: string[],
    claims: TenantClaims,
  ): Promise<PushTokenRecord[]> {
    if (userIds.length === 0) return [];
    return runInTenantTransaction(this.prisma, claims, () =>
      getTenantPrismaClient<PrismaClient>().pushToken.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, expoPushToken: true },
      }),
    );
  }

  /**
   * ADR-006 §9.1's "background send-failure sweep" — deletes by token
   * VALUE alone (not scoped to a user): a `DeviceNotRegistered` push
   * ticket/receipt identifies the dead token itself, not which user row it
   * belongs to (and per the schema comment, the same token could in
   * principle be registered under more than one user row after an
   * uninstall/reinstall onto a different account — all of them are equally
   * dead). Swallows its own errors: this runs from inside
   * `PushNotificationService`'s already-fire-and-forget dispatch path, so
   * it must never surface as an unhandled rejection.
   */
  async removeTokenByValue(
    expoPushToken: string,
    claims: TenantClaims,
  ): Promise<void> {
    try {
      await runInTenantTransaction(this.prisma, claims, () =>
        getTenantPrismaClient<PrismaClient>().pushToken.deleteMany({
          where: { expoPushToken },
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to prune dead push token: ${(err as Error).message}`,
      );
    }
  }
}
