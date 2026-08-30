-- Epic 12 (Guard Patrol Log, user request) follow-up to the RLS policy loop
-- in prisma/migrations/20260828072452_enable_rls/migration.sql (see that
-- migration + prisma/sql/rls-policies.sql for the full pattern explanation,
-- also documented in docs/ARCHITECTURE.md §3).
--
-- One new tenant-owned table was added in the preceding migration
-- (20260830161829_add_patrol_logs): patrol_logs. Per rls-policies.sql's own
-- "HOW TO EXTEND" header comment, every new tenant table needs this same
-- three-statement treatment. This migration applies it to just that one new
-- table (not a re-run of the full table list, since the others already have
-- their policies from earlier migrations and CREATE POLICY would error on a
-- duplicate name).
--
-- prisma/sql/rls-policies.sql's table array already includes patrol_logs
-- (it was updated ahead of time when the model was added to schema.prisma),
-- so a fresh database (prisma migrate deploy from zero) gets correct RLS
-- coverage via the ORIGINAL enable_rls migration reading an ARRAY[...]
-- that, as committed at that point in history, does NOT yet list this
-- table — that migration file is immutable history and must not be edited
-- retroactively. This follow-up migration is what actually adds coverage
-- for a database that already ran the earlier migrations.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patrol_logs'
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
