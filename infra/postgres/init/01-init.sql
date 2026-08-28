-- Runs once, automatically, the first time the postgres container's data
-- volume is created (docker-entrypoint-initdb.d convention). Executed by the
-- bootstrap superuser (POSTGRES_USER in docker-compose.yml, default "postgres").
--
-- Purpose: create a dedicated, NON-superuser role for the backend app to
-- connect as. This matters for Row-Level Security (see
-- apps/backend/prisma/sql/rls-policies.sql and docs/ARCHITECTURE.md):
-- Postgres superusers and roles with BYPASSRLS always skip RLS policies no
-- matter what, so if the app connected as the bootstrap superuser, every RLS
-- policy in this repo would be silently ignored.
--
-- village_app owns the `village_security` database (and therefore owns every
-- table `prisma migrate` creates in it), but is NOSUPERUSER/NOBYPASSRLS, so
-- `ALTER TABLE ... FORCE ROW LEVEL SECURITY` in rls-policies.sql is actually
-- enforced against it. CREATEDB is granted only so `prisma migrate dev` can
-- create its transient shadow database for schema diffing in local
-- development — CREATEDB does NOT let a role bypass RLS (only rolsuper or
-- rolbypassrls do; they stay off here), so this does not weaken the RLS
-- guarantee. Staging/production should use `prisma migrate deploy`
-- (no shadow database involved) with a role that has NOCREATEDB, tightening
-- this further outside local dev — see docs/ARCHITECTURE.md.
CREATE ROLE village_app WITH LOGIN PASSWORD 'village_dev_password' NOSUPERUSER CREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE DATABASE village_security OWNER village_app;

\connect village_security

-- Since PostgreSQL 15, the `public` schema is no longer world-creatable by
-- default; grant the app role full rights on it explicitly so `prisma
-- migrate` can create tables in its own database.
GRANT ALL ON SCHEMA public TO village_app;

-- --------------------------------------------------------------------------
-- village_app_auth_lookup — a second, narrowly-scoped role for the ONE
-- genuinely cross-tenant query the app needs: resolving which village a
-- phone number belongs to during login, BEFORE village_id is known (see
-- apps/backend/src/modules/auth/auth.service.ts). `users.phone` is unique
-- only per-village (schema.prisma), so this lookup cannot go through
-- village_app — RLS's FORCE ROW LEVEL SECURITY applies to EVERY session on
-- that role regardless of whether the query runs inside a transaction, so
-- with no `app.current_village_id` set, village_app always sees zero rows
-- (the RLS "default deny" — this is documented and correct, see
-- rls-policies.sql). PrismaService cannot informally "bypass" RLS just by
-- not opening a transaction; only an actual BYPASSRLS role can.
--
-- This role is deliberately minimal, NOT a general-purpose RLS bypass:
--   - BYPASSRLS, but GRANTed SELECT on only the exact columns login needs
--     from `users` (id, village_id, phone, role, house_id) — it cannot read
--     password_hash, line_user_id, or any other tenant table (visitor_passes,
--     entry_logs, etc.) at all, since no grants exist for them.
--   - No INSERT/UPDATE/DELETE anywhere.
-- Used ONLY by auth.service.ts's initial phone->candidates lookup, via a
-- separate connection string (AUTH_LOOKUP_DATABASE_URL, .env.example) — the
-- rest of the app continues to use village_app for everything else, so RLS
-- still holds for every other code path.
-- NOTE: the actual `GRANT SELECT (...) ON users TO village_app_auth_lookup`
-- does NOT live here, even though this file is where the role is created.
-- This script (docker-entrypoint-initdb.d) runs ONCE, on first container
-- boot, BEFORE `prisma migrate` has ever run — the `users` table does not
-- exist yet at this point, so a GRANT against it here would silently fail
-- (confirmed empirically: role creation succeeded, the users GRANT did not,
-- and no later statement in this file ran either since docker's init runner
-- uses ON_ERROR_STOP). The grant is applied as part of a Prisma migration
-- instead (see prisma/migrations/*_grant_auth_lookup_role/migration.sql),
-- which runs AFTER `users` exists.
CREATE ROLE village_app_auth_lookup WITH LOGIN PASSWORD 'village_dev_auth_lookup_password' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
GRANT CONNECT ON DATABASE village_security TO village_app_auth_lookup;
GRANT USAGE ON SCHEMA public TO village_app_auth_lookup;
