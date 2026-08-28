-- Phase 2 follow-up to the RLS policy loop in
-- prisma/migrations/20260828072452_enable_rls/migration.sql (see that
-- migration + prisma/sql/rls-policies.sql for the full pattern explanation,
-- also documented in docs/ARCHITECTURE.md §3).
--
-- Two new tenant-owned tables were added in the preceding migration
-- (20260828145655_phase2_chat_maintenance_transport): maintenance_ticket_counters
-- and transport_providers. Per rls-policies.sql's own "HOW TO EXTEND" header
-- comment, every new tenant table needs this same three-statement treatment.
-- This migration applies it to just the two new tables (not a re-run of the
-- full table list, since the others already have their policies from the
-- earlier migration and CREATE POLICY would error on a duplicate name).
--
-- prisma/sql/rls-policies.sql's table array has also been updated to include
-- both tables, so a fresh database (prisma migrate deploy from zero) gets
-- correct RLS coverage via the ORIGINAL enable_rls migration reading an
-- ARRAY[...] that, as committed at that point in history, does NOT yet list
-- these two tables — that migration file is immutable history and must not
-- be edited retroactively. This follow-up migration is what actually adds
-- coverage for a database that already ran the earlier migrations, and
-- rls-policies.sql (the living "source of truth for policy text" per its own
-- header) staying in sync with the CURRENT full table list is what a Dev
-- agent copies from if they ever need to stand up RLS by hand outside the
-- migration history (e.g. writing a brand-new consolidated migration later).

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'maintenance_ticket_counters', 'transport_providers'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (village_id = NULLIF(current_setting(''app.current_village_id'', true), '''')::uuid)
         WITH CHECK (village_id = NULLIF(current_setting(''app.current_village_id'', true), '''')::uuid);',
      t
    );
  END LOOP;
END $$;
