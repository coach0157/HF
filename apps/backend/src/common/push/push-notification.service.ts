import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Expo } from "expo-server-sdk";
import type { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { PushTokenService } from "./push-token.service";
import type { TenantClaims } from "../rls/tenant-context";

/**
 * ADR-006's deep-link data schema — EXACTLY `{ type, id }`, nothing richer
 * (see docs/ARCHITECTURE.md ADR-006 "Deep-link data schema" for why: Expo
 * payloads should carry the minimum needed to route, the receiving screen
 * re-fetches full/fresh detail from the same REST endpoint it would use
 * anyway). `id` is always that trigger's own primary key — `ChatRoom.id`
 * for chat, not `ChatMessage.id` (tapping a chat push opens the
 * conversation, not one message).
 */
export type PushDeepLinkType = "entry" | "sos" | "announcement" | "chat";

export interface PushDeepLinkData {
  type: PushDeepLinkType;
  id: string;
}

/**
 * ADR-006 §9.2's exact method shape: `send(userIds, payload: { title, body,
 * data })`. Announcement's `level` (spec 2.2 — client should pick
 * color/sound by level) is deliberately NOT added as a fourth `data` field:
 * ADR-006's data schema is "exactly `{type, id}`", so instead
 * `AnnouncementService` folds level into `title`'s text (an emoji/prefix
 * hint) and the tapped-through `AnnouncementDetailScreen` re-fetches the
 * announcement (which carries the real `level`) to pick the actual
 * color/sound treatment — same "re-fetch fresh detail, don't embed it in
 * the payload" principle the ADR already applies to `id`.
 */
export interface PushPayload {
  title: string;
  body: string;
  data: PushDeepLinkData;
}

/**
 * Epic 11 (docs/ARCHITECTURE.md ADR-006, PHASE2_BACKLOG.md Epic 11) — the
 * one shared service entry-log/sos/announcement/chat all call.
 *
 * ADR-006's fire-and-forget decision applies to ALL FOUR triggers,
 * including SOS (the strongest case FOR awaiting — see the ADR's dedicated
 * reasoning): `send()` returns `void`, not `Promise<void>`, on purpose —
 * every call site invokes it WITHOUT `await`, and a void-returning
 * signature is the only thing that makes "don't await this" impossible to
 * accidentally violate in a future edit. Internally `send()` never lets a
 * rejected promise escape; every failure (bad token, Expo API
 * timeout/error, partial chunk failure) is logged, never thrown.
 */
@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly expo: Expo;

  constructor(
    private readonly pushTokenService: PushTokenService,
    private readonly config: ConfigService,
  ) {
    this.expo = new Expo({
      // Optional (see .env.example) — Expo's push service works without it
      // for Expo Go / this project's current scale (ADR-006).
      accessToken: this.config.get<string>("EXPO_ACCESS_TOKEN") || undefined,
    });
  }

  send(userIds: string[], payload: PushPayload, claims: TenantClaims): void {
    this.dispatch(userIds, payload, claims).catch((err: unknown) => {
      // Should be unreachable — dispatch() already catches everything
      // internally — but this is the last line of defense per ADR-006's
      // "a push failure needs its own observability path, not a thrown
      // exception" consequence.
      this.logger.error(
        `Unexpected error in PushNotificationService.dispatch(): ${
          (err as Error)?.message
        }`,
        (err as Error)?.stack,
      );
    });
  }

  private async dispatch(
    userIds: string[],
    payload: PushPayload,
    claims: TenantClaims,
  ): Promise<void> {
    if (userIds.length === 0) return;

    let tokens;
    try {
      tokens = await this.pushTokenService.listTokensForUsers(userIds, claims);
    } catch (err) {
      this.logger.error(
        `Failed to look up push tokens for ${userIds.length} user(s): ${
          (err as Error)?.message
        }`,
      );
      return;
    }
    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = [];
    let skipped = 0;
    for (const token of tokens) {
      if (!Expo.isExpoPushToken(token.expoPushToken)) {
        skipped += 1;
        continue;
      }
      messages.push({
        to: token.expoPushToken,
        title: payload.title,
        body: payload.body,
        // `PushDeepLinkData` is deliberately a closed/exact type (ADR-006's
        // "exactly {type, id}") — Expo's own `ExpoPushMessage.data` field is
        // typed as the broader `Record<string, unknown>`, hence the cast.
        data: payload.data as unknown as Record<string, unknown>,
        sound: "default",
      });
    }
    if (skipped > 0) {
      this.logger.warn(
        `Skipped ${skipped} push token(s) that are not valid Expo push tokens`,
      );
    }
    if (messages.length === 0) return;

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        this.handleTickets(chunk, tickets, claims);
      } catch (err) {
        // Whole-chunk failure (network error, Expo API down/timeout) — log
        // and move on to the next chunk. Never throw (ADR-006).
        this.logger.error(
          `Push chunk of ${chunk.length} message(s) failed to send: ${
            (err as Error)?.message
          }`,
        );
      }
    }
  }

  /**
   * Per-message ticket errors — the immediate half of ADR-006 §9.1's "delete
   * token that Expo reports invalid" requirement. `DeviceNotRegistered` at
   * ticket time means Expo already knows the token is dead without even
   * attempting delivery; prune it right away. Full receipt-polling (Expo
   * asynchronously discovers other `DeviceNotRegistered` cases up to ~a day
   * later, via `getPushNotificationReceiptsAsync`) is a separate background
   * job, deliberately not implemented here — flagged as a Dev-agent TODO in
   * schema.prisma's own `PushToken` comment, same status as before this
   * round; this method only closes the send-time half of that gap.
   */
  private handleTickets(
    chunk: ExpoPushMessage[],
    tickets: ExpoPushTicket[],
    claims: TenantClaims,
  ): void {
    tickets.forEach((ticket, i) => {
      if (ticket.status !== "error") return;
      const message = chunk[i];
      this.logger.warn(
        `Push ticket error for token ${String(message?.to)}: ${ticket.message}`,
      );
      if (ticket.details?.error === "DeviceNotRegistered") {
        const deadToken =
          ticket.details.expoPushToken ??
          (typeof message?.to === "string" ? message.to : undefined);
        if (deadToken) {
          this.pushTokenService
            .removeTokenByValue(deadToken, claims)
            .catch(() => undefined);
        }
      }
    });
  }
}
