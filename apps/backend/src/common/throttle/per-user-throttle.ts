import { getTenantClaims } from "../rls/tenant-context";

/**
 * Shared helper for the per-account (not blanket per-IP) rate limits spec
 * 3.4 asks for on abuse-prone endpoints: QR creation, manual entry
 * recording, SOS triggering. CommonModule's global ThrottlerGuard default is
 * IP-based and app-wide — not tight enough for these, and IP-based limiting
 * is the wrong axis anyway (a whole household/guard post shares one IP).
 *
 * Overrides the SAME 'default' named throttler that CommonModule registers
 * (see common.module.ts) — @Throttle()'s route-level bucket keys already
 * include the controller+handler name (see @nestjs/throttler's
 * ThrottlerGuard.generateKey), so this does not collide with the app-wide
 * default bucket or with other routes using this same helper.
 */
export function perUserThrottle(limit: number, ttlMs: number) {
  return {
    default: {
      limit,
      ttl: ttlMs,
      getTracker: async () => getTenantClaims()?.userId ?? "anonymous",
    },
  };
}
