import { Module } from '@nestjs/common';

/**
 * Epic 4 — SOS / Emergency Alert. See MVP_BACKLOG.md Epic 4 and spec 2.2/3.4.
 *
 * Dev agent TODO:
 *  - `POST /sos-alerts` — @Roles('RESIDENT'). Client already enforces the
 *    2-second hold (spec: backend just receives the payload after that).
 *  - Routing: query `guard_shifts WHERE village_id = ? AND status =
 *    'ON_DUTY'` at trigger time (this module owns `guard_shifts` reads for
 *    routing; ../guard-shift owns the on_duty/off_duty toggle endpoints) —
 *    push ONLY to that set. Off-duty guards must never receive it.
 *  - Optional neighbor notification within a configurable radius, computed
 *    from `houses.latitude/longitude` (haversine) — keep it OFF by default
 *    until a village-level setting exists to enable it.
 *  - `PATCH /sos-alerts/:id/acknowledge` — @Roles('GUARD'), status
 *    PENDING -> ACKNOWLEDGED, set acknowledged_by_guard_id.
 *  - Rate-limit per resident with a cooldown window, NOT a blanket
 *    endpoint-wide block — spec 3.4 is explicit that a real emergency must
 *    never be delayed by rate-limiting logic. Do not reuse
 *    CommonModule's default ThrottlerGuard config as-is for this reason;
 *    give this endpoint its own @Throttle() policy tuned for
 *    per-user cooldown rather than global request volume.
 *  - Real-time delivery to on-duty guards (WebSocket or FCM — pick one and
 *    be consistent with whatever chat/Epic 2 entry-notification ends up
 *    using).
 *  - All DB access through `getTenantPrismaClient()`, not PrismaService.
 */
@Module({})
export class SosModule {}
