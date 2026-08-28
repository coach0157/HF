import { Module } from '@nestjs/common';

/**
 * Epic 2 — Visitor QR + Entry/Exit Log. See MVP_BACKLOG.md Epic 2 and spec 2.1/3.3/3.4.
 * (This module owns `visitor_passes`; entry/exit recording lives in
 * ../entry-log since it also covers manual/no-QR entries — split matches
 * the two resource groups in spec 3.3.)
 *
 * Dev agent TODO:
 *  - QR token: a SEPARATE signed JWT from the auth JWT (use its own secret,
 *    QR_TOKEN_SECRET — do not reuse JWT_ACCESS_SECRET), payload carries
 *    pass_id, valid_from/to, usage_type. Sign on `POST /visitor-passes`,
 *    verify on `GET /visitor-passes/:token`.
 *  - `POST /visitor-passes` — @Roles('RESIDENT'), validate valid_from/to +
 *    usage_type, apply a per-user rate limit (spec 3.4 — QR creation abuse
 *    detection) tighter than CommonModule's app-wide default.
 *  - `PATCH /visitor-passes/:id/revoke` — owner-only (created_by_user_id ===
 *    current user), status -> REVOKED. A revoked pass must fail scan even
 *    if still within valid_from/to.
 *  - `GET /visitor-passes/:token` — used by guard's scan screen. Verify JWT
 *    signature + expiry + status != REVOKED/EXPIRED before returning
 *    visitor info. Do NOT expose this without a Guard-role JWT (this is NOT
 *    the "path สแกน QR ของแขก" that spec 3.3 exempts from auth — the
 *    visitor never calls the API directly, the Guard app does).
 *  - Design note + stub endpoint for the offline revoked-token sync list
 *    (spec 3.4 "Offline scan กับ revocation") — no UI needed this round,
 *    just leave the endpoint shape ready for the future Guard mobile app.
 *  - All queries against `visitor_passes` inside authenticated endpoints
 *    must go through `getTenantPrismaClient()`
 *    (src/common/rls/tenant-context.ts), never PrismaService directly, so
 *    RLS actually applies.
 */
@Module({})
export class VisitorPassModule {}
