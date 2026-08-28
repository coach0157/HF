import { Injectable } from "@nestjs/common";

/**
 * Epic 8 — Chat. Per-user sliding-window rate limiter for the `send_message`
 * WS event (PHASE2_BACKLOG.md Epic 8: "Rate-limit send_message ต่อ user
 * ป้องกัน spam/flood คล้าย pattern perUserThrottle ที่ใช้กับ SOS/entry-log").
 *
 * Deliberately NOT reusing `@nestjs/throttler`'s `ThrottlerGuard` /
 * `perUserThrottle()` helper (common/throttle/per-user-throttle.ts) here:
 * that guard's `getRequestResponse()` (and this Nest version's built-in
 * storage/tracker plumbing) is wired for `ExecutionContext.switchToHttp()`
 * and isn't WS-context-aware out of the box — making it work would mean
 * either monkey-patching the guard or writing a custom
 * `ThrottlerStorage`/context adapter, which is more machinery than a chat
 * flood guard needs. A small in-memory sliding window keyed by userId is
 * enough for this single-process MVP deployment (see ADR-004's "Revisit
 * when... multiple Node instances" note — the same caveat applies here: a
 * multi-instance deployment would need a shared store, e.g. Redis, same as
 * the Socket.io adapter itself would).
 */
@Injectable()
export class WsRateLimiterService {
  private readonly hits = new Map<string, number[]>();

  /** Returns true if `key` is allowed to proceed right now, and records the hit. */
  allow(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = (this.hits.get(key) ?? []).filter(
      (t) => now - t < windowMs,
    );
    if (timestamps.length >= limit) {
      this.hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }
}
