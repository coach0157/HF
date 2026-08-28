-- Phase 2 / Epic 11 follow-up to the RLS policy loop in
-- prisma/migrations/20260828072452_enable_rls/migration.sql (see that
-- migration + prisma/sql/rls-policies.sql for the full pattern explanation,
-- also documented in docs/ARCHITECTURE.md §3).
--
-- One new tenant-owned table was added in the preceding migration
-- (20260828223706_add_push_tokens): push_tokens. Per rls-policies.sql's own
-- "HOW TO EXTEND" header comment, every new tenant table needs this same
-- three-statement treatment. This migration applies it to just that one new
-- table (not a re-run of the full table list, since the others already have
-- their policies from earlier migrations and CREATE POLICY would error on a
-- duplicate name).
--
-- prisma/sql/rls-policies.sql's table array has also been updated to include
-- push_tokens, so a fresh database (prisma migrate deploy from zero) gets
-- correct RLS coverage via the ORIGINAL enable_rls migration reading an
-- ARRAY[...] that, as committed at that point in history, does NOT yet list
-- this table — that migration file is immutable history and must not be
-- edited retroactively. This follow-up migration is what actually adds
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
    'push_tokens'
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
