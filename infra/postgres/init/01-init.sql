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
