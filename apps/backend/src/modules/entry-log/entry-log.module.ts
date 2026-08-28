import { Module } from '@nestjs/common';

/**
 * Epic 2 — Entry/Exit Log (scan + manual). See MVP_BACKLOG.md Epic 2 and spec 2.1/3.3.
 *
 * Dev agent TODO:
 *  - `POST /entry-logs` — @Roles('GUARD'). Two paths: (a) from a scanned
 *    visitor-pass token — validates + transitions the pass's status
 *    UNUSED -> ENTERED via visitor-pass module's service; (b) manual entry
 *    (no QR) — requires photo upload of ID card/plate. `pass_id` is
 *    nullable for manual entries per schema.
 *  - Photo upload: route ID-card/plate photos to the SEPARATE, higher-
 *    security bucket (S3_BUCKET_SENSITIVE_ID) vs. general entry photos
 *    (S3_BUCKET_ENTRY_LOGS) per spec 3.4 — different retention (90 days for
 *    ID photos vs. 6 months for the entry_logs row itself). Implement the
 *    90-day auto-delete as a scheduled job (e.g. @nestjs/schedule cron)
 *    that only touches the sensitive bucket's objects, not the entry_logs
 *    rows.
 *  - `PATCH /entry-logs/:id/confirm-exit` — the critical "no auto-close"
 *    rule from spec 2.1: scanning a pass a second time must NOT by itself
 *    set exit_time. This endpoint is the only path that sets exit_time +
 *    exit_confirmed_by_user_id + exit_confirmation_method. Support BOTH
 *    confirmation paths from spec: guard re-scan-and-confirm (@Roles('GUARD'))
 *    and resident push-and-confirm (@Roles('RESIDENT'), must be the pass's
 *    house owner/member). Transition the linked pass to EXITED.
 *  - `GET /entry-logs?house_id=&date=` — paginate; the composite index
 *    `@@index([villageId, houseId, entryTime])` in schema.prisma is already
 *    there to support this + the 6-month retention search.
 *  - FCM push to the house owner within ~3s of a successful scan-in (soft
 *    target per spec — not a hard SLA).
 *  - Rate-limit QR-scan-based AND manual-entry creation per guard account
 *    (spec 3.4 — compromised-guard-account abuse detection), alert admin on
 *    threshold breach.
 *  - All DB access through `getTenantPrismaClient()`, not PrismaService.
 */
@Module({})
export class EntryLogModule {}
