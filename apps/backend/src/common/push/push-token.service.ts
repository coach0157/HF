import { Injectable, Logger } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Expo } from "expo-server-sdk";
import { PrismaService } from "../prisma/prisma.service";
import { getTenantPrismaClient } from "../rls/tenant-context";
import type { TenantClaims } from "../rls/tenant-context";

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
 * `listTokensForUsers`/`removeTokenByValue` deliberately use the raw
 * `PrismaService` instead — see their own doc comments for why: they are
 * called from `PushNotificationService.send()`, which ADR-006 requires to
 * be fire-and-forget and NOT awaited by any request handler. By the time
 * that background work actually runs, the request that triggered it may
 * have already returned and closed its RLS transaction, so `tx` from that
 * request is not a safe thing to depend on — this mirrors PrismaService's
 * own doc comment carve-out for "genuinely cross-tenant/system code".
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
  async listTokensForUsers(userIds: string[]): Promise<PushTokenRecord[]> {
    if (userIds.length === 0) return [];
    return this.prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, expoPushToken: true },
    });
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
  async removeTokenByValue(expoPushToken: string): Promise<void> {
    try {
      await this.prisma.pushToken.deleteMany({ where: { expoPushToken } });
    } catch (err) {
      this.logger.warn(
        `Failed to prune dead push token: ${(err as Error).message}`,
      );
    }
  }
}
