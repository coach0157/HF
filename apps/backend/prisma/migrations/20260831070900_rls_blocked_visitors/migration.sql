-- RLS follow-up for the new `blocked_visitors` table (see
-- prisma/sql/rls-policies.sql's "HOW TO EXTEND" header comment and the two
-- prior follow-up migrations this same pattern comes from:
-- 20260828145708_rls_phase2_tables and 20260828223707_rls_push_tokens).
-- The table itself was created by 20260831070817_add_blocked_visitors.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'blocked_visitors'
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
