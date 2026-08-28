import { Module } from '@nestjs/common';

/**
 * Epic 3 — Announcement. See MVP_BACKLOG.md Epic 3 and spec 2.2/3.3.
 *
 * Dev agent TODO:
 *  - `POST /announcements` — @Roles('ADMIN'). Validate `level` (NORMAL/
 *    IMPORTANT/EMERGENCY) and `target_scope` (ALL/ZONE/HOUSE); EMERGENCY
 *    must also trigger the SMS fallback path (spec 2.2).
 *  - `GET /announcements` — filter the feed by the CALLING user's
 *    house/zone against the announcement's target_scope (join through
 *    `houses` for zone matching). Remember target_scope=HOUSE needs a way
 *    to store WHICH house(s) — the spec's ER doesn't have a join table for
 *    this; decide and add one (e.g. `announcement_targets`) rather than
 *    overloading an existing column, and note it as a schema addition.
 *  - `POST /announcements/:id/read` — idempotent read receipt: use the
 *    existing `@@unique([announcementId, userId])` on AnnouncementRead and
 *    an upsert (or catch the unique-violation) rather than insert-then-check.
 *  - Target-scope resolution: resolve the destination user list BEFORE
 *    calling the push/SMS services.
 *  - Push notification metadata should include `level` so client apps can
 *    pick color/sound (spec: color/sound are a client concern, backend just
 *    carries the level).
 *  - All DB access through `getTenantPrismaClient()`, not PrismaService.
 */
@Module({})
export class AnnouncementModule {}
