-- Row-Level Security policies for every tenant-owned table.
--
-- STATUS: this file is the living source of truth for the FULL current table
-- list + policy text, but it is no longer a 1:1 mirror of a single migration
-- file. The original run was prisma/migrations/20260828072452_enable_rls/
-- migration.sql (scaffold validation — see docs/ARCHITECTURE.md "Validated
-- during scaffolding"). Phase 2 added two tables (maintenance_ticket_counters,
-- transport_providers) after that migration was already applied to a real
-- database, so their RLS coverage was shipped as a separate follow-up
-- migration (prisma/migrations/20260828145708_rls_phase2_tables/migration.sql)
-- rather than by editing the immutable original migration file. Epic 11
-- (Push Notifications) added a third such table (push_tokens): the table
-- itself was created by prisma/migrations/20260828223706_add_push_tokens/
-- migration.sql, and its RLS coverage was shipped as a further follow-up
-- migration (prisma/migrations/20260828223707_rls_push_tokens/migration.sql)
-- the same way. This file's ARRAY[...] below was updated to include all of
-- them so it stays correct as documentation/reference, but replaying
-- migration history top-to-bottom (`prisma migrate deploy` on a fresh
-- database) is what actually applies RLS in practice — every migration runs
-- in order and their combined effect matches what's below.
--
-- HOW TO EXTEND (Prisma has no schema syntax for RLS, so it can never be
-- expressed in schema.prisma) — do this whenever a new tenant-owned table is
-- added to schema.prisma:
--   1. Add the new table name to the ARRAY[...] below.
--   2. Create a follow-up migration:  npm run prisma:migrate:dev -- --create-only --name <describe>
--   3. Replace the generated (empty) migration.sql body with this file's
--      NEW full content, then run:    npm run prisma:migrate:dev
--   4. This file stays the single source of truth for policy text — keep the
--      table list here and the migration file in sync.
--
-- Full explanation of the pattern (app.current_village_id session variable,
-- how NestJS sets it per-request, why FORCE ROW LEVEL SECURITY + a non-
-- superuser DB role are both required) lives in docs/ARCHITECTURE.md.

-- Helper macro (conceptually): every policy below reads
--   NULLIF(current_setting('app.current_village_id', true), '')::uuid
-- The `true` second argument to current_setting makes Postgres return NULL
-- instead of raising an error when the setting was never SET for the current
-- transaction. But on a POOLED connection that has previously had this GUC
-- set at least once (i.e. every real connection after its first request),
-- Postgres does not go back to NULL when a later transaction forgets to set
-- it again — current_setting(..., true) instead returns '' (empty string),
-- and '' cast directly to ::uuid RAISES a Postgres error rather than
-- evaluating to NULL. NULLIF(..., '') normalizes that empty-string case back
-- to NULL BEFORE the ::uuid cast ever runs, so both "never set" and "reset to
-- empty by a reused pooled connection" collapse to the same NULL, and
-- `village_id = NULL` evaluates to NULL (falsy) in the USING clause either
-- way. A connection that forgot to set tenant context always sees ZERO rows,
-- never an error and never all rows. This is a deliberate default-deny
-- choice (see docs/ARCHITECTURE.md §3.1).

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'houses', 'house_members',
    'visitor_passes', 'entry_logs',
    'announcements', 'announcement_reads', 'announcement_targets',
    'sos_alerts', 'guard_shifts',
    'chat_rooms', 'chat_participants', 'chat_messages',
    'maintenance_tickets', 'maintenance_ticket_counters', 'transport_providers',
    'facilities', 'bookings',
    'bills', 'payments', 'refresh_tokens', 'audit_logs', 'push_tokens'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    -- FORCE makes the policy apply even to the table owner. The app DB role
    -- (village_app, see infra/postgres/init/01-init.sql) owns these tables
    -- because it ran `prisma migrate`, so without FORCE it would silently
    -- bypass RLS on its own connections — defeating the whole point.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (village_id = NULLIF(current_setting(''app.current_village_id'', true), '''')::uuid)
         WITH CHECK (village_id = NULLIF(current_setting(''app.current_village_id'', true), '''')::uuid);',
      t
    );
  END LOOP;
END $$;

-- `villages` itself is intentionally NOT enabled for RLS: there is no
-- village_id column to filter by, and cross-village access to this table is
-- restricted at the application layer (platform super-admin only, out of
-- MVP scope). Every other table above is scoped to exactly one village per
-- row and is covered by the policy loop.
