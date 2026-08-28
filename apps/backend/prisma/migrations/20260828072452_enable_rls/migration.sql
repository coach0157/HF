-- Row-Level Security policies for every tenant-owned table.
--
-- HOW TO APPLY (Prisma has no schema syntax for RLS, so this is not expressed
-- in schema.prisma):
--   1. Run the initial schema migration:  npm run prisma:migrate:dev -- --name init
--   2. Create a follow-up migration:      npm run prisma:migrate:dev -- --create-only --name enable_rls
--   3. Replace the generated (empty) migration.sql body with the contents of
--      this file, then run:               npm run prisma:migrate:dev
--   4. From then on this file is the source of truth for policy text — keep it
--      in sync if you add a new tenant table, and repeat step 2-3.
--
-- Full explanation of the pattern (app.current_village_id session variable,
-- how NestJS sets it per-request, why FORCE ROW LEVEL SECURITY + a non-
-- superuser DB role are both required) lives in docs/ARCHITECTURE.md.

-- Helper macro (conceptually): every policy below reads
--   current_setting('app.current_village_id', true)::uuid
-- The `true` second argument makes Postgres return NULL instead of raising an
-- error when the setting was never SET for the current transaction. Since
-- `village_id = NULL` evaluates to NULL (falsy) in the USING clause, a
-- connection that forgot to set tenant context sees ZERO rows rather than an
-- error or, worse, ALL rows. This is a deliberate default-deny choice.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'houses', 'house_members',
    'visitor_passes', 'entry_logs',
    'announcements', 'announcement_reads',
    'sos_alerts', 'guard_shifts',
    'chat_rooms', 'chat_participants', 'chat_messages',
    'maintenance_tickets', 'facilities', 'bookings',
    'bills', 'payments'
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
         USING (village_id = current_setting(''app.current_village_id'', true)::uuid)
         WITH CHECK (village_id = current_setting(''app.current_village_id'', true)::uuid);',
      t
    );
  END LOOP;
END $$;

-- `villages` itself is intentionally NOT enabled for RLS: there is no
-- village_id column to filter by, and cross-village access to this table is
-- restricted at the application layer (platform super-admin only, out of
-- MVP scope). Every other table above is scoped to exactly one village per
-- row and is covered by the policy loop.
