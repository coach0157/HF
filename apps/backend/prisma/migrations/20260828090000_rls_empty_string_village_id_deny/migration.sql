-- Fixes QA_REPORT.md Finding A: on a pooled Postgres connection that has
-- previously had `app.current_village_id` SET LOCAL at least once (i.e.
-- every real connection after its first request through RlsInterceptor), a
-- LATER transaction on that same connection which forgets to set it again
-- gets `current_setting('app.current_village_id', true) = ''` (empty
-- string), not NULL. `''::uuid` raises a Postgres error instead of
-- evaluating to NULL, so the previously-documented "forgotten tenant
-- context always degrades to zero rows" behavior (docs/ARCHITECTURE.md
-- §3.1) was only true on a never-before-used connection.
--
-- Fix: wrap current_setting(...) in NULLIF(..., '') so the empty-string case
-- is normalized to NULL before the ::uuid cast ever runs. Both "never set"
-- and "reset to empty by a reused pooled connection" now collapse to the
-- same NULL, and `village_id = NULL` is always falsy — so a forgotten tenant
-- context now ALWAYS degrades to zero rows, never a thrown error, on every
-- RLS-protected table.
--
-- Recreates every tenant_isolation policy from prisma/sql/rls-policies.sql
-- (now updated to match) with the NULLIF-guarded expression. DROP + CREATE
-- rather than ALTER POLICY because Postgres has no single statement to
-- replace both USING and WITH CHECK at once for an existing policy.
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
    'maintenance_tickets', 'facilities', 'bookings',
    'bills', 'payments', 'refresh_tokens', 'audit_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);

    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (village_id = NULLIF(current_setting(''app.current_village_id'', true), '''')::uuid)
         WITH CHECK (village_id = NULLIF(current_setting(''app.current_village_id'', true), '''')::uuid);',
      t
    );
  END LOOP;
END $$;
