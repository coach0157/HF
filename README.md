# Village Security & Community App

ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน — multi-tenant SaaS backend + admin dashboard.

- **Spec (source of truth):** [`village-security-app-spec.md`](./village-security-app-spec.md)
- **MVP backlog:** [`docs/MVP_BACKLOG.md`](./docs/MVP_BACKLOG.md)
- **Architecture / ADRs / RLS pattern:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

This repo is a scaffold: infrastructure, module boundaries, the multi-tenant
Row-Level Security pattern, and the full Prisma schema are in place and
validated end-to-end against a real Postgres instance. Business logic inside
each `apps/backend/src/modules/*` module is intentionally NOT implemented yet
— see the TODO comment at the top of each `*.module.ts` file for what's next.

## Repo layout

```
apps/
  backend/       NestJS API (see apps/backend/README section below)
  admin-web/     React (Vite) admin dashboard
infra/
  postgres/init/ Bootstrap SQL that runs once when the Postgres container's
                 data volume is first created (creates the app DB role)
docs/
  ARCHITECTURE.md
  MVP_BACKLOG.md
docker-compose.yml   local Postgres
```

Monorepo tooling: plain **npm workspaces** (`apps/*`) — no Nx/Turborepo. See
`docs/ARCHITECTURE.md` ADR-001 for why.

## Prerequisites

- Node.js >= 20 (developed/validated against Node 24)
- Docker Desktop (for local Postgres)

## First-time setup

```bash
# 1. Install all workspace dependencies (backend + admin-web) from the repo root
npm install

# 2. Start Postgres (creates the `village_app` DB role + `village_security`
#    database automatically via infra/postgres/init/01-init.sql on first run)
docker compose up -d db

# 3. Configure the backend
cp apps/backend/.env.example apps/backend/.env
# defaults already match docker-compose.yml — no edits needed for local dev

# 4. Apply the database schema (both migrations — initial schema + RLS
#    policies — are already committed under apps/backend/prisma/migrations/)
npm run prisma:migrate:dev

# 5. Seed a sample village/admin/house
npm run prisma:seed

# 6. Configure the admin web app
cp apps/admin-web/.env.example apps/admin-web/.env.local
```

## Running in dev

```bash
# Terminal 1 — backend (http://localhost:3001, Swagger at /docs)
npm run dev:backend

# Terminal 2 — admin dashboard (http://localhost:5173)
npm run dev:admin
```

Smoke-test the backend once it's up:

```bash
curl http://localhost:3001/health
# => {"status":"ok","db":"connected"}
```

## Database access / Prisma Studio

```bash
npm run --workspace apps/backend prisma:studio
```

## Stopping

```bash
docker compose down        # stop Postgres, keep data
docker compose down -v     # stop Postgres AND wipe local data volume
```

## What's already built vs. what Dev agent implements next

**Built and validated:**
- Multi-tenant Prisma schema (`apps/backend/prisma/schema.prisma`) covering
  every table in spec 3.2 (MVP + Phase 2/3 tables, so the shape is stable)
- Row-Level Security: policies applied and *tested directly against Postgres*
  (cross-tenant query returned zero leaked rows; no-context query returned
  zero rows) — see `docs/ARCHITECTURE.md`
- NestJS request pipeline that sets the RLS session variable per-request
  (`TenantContextMiddleware` + `RlsInterceptor` in `apps/backend/src/common/rls/`)
- JWT verification, `@Roles()` RBAC guard, `@Public()` opt-out, `@CurrentUser()`
- Admin web: routing skeleton for every screen in spec 1.3 + backlog Epic 5
- `docker-compose.yml`, DB role bootstrap, backend build (`nest build`) and
  admin-web build (`vite build`) both verified to succeed

**Not built — each module's TODO comment has the specifics:**
- `apps/backend/src/modules/auth/` — OTP service, login/refresh endpoints, JWT issuing
- `apps/backend/src/modules/visitor-pass/` — QR create/revoke/scan
- `apps/backend/src/modules/entry-log/` — entry/exit recording, confirm-exit flow, photo upload
- `apps/backend/src/modules/announcement/` — CRUD, target-scope resolution, push/SMS
- `apps/backend/src/modules/sos/` — trigger, on-duty routing, acknowledge
- `apps/backend/src/modules/guard-shift/` — on_duty/off_duty toggle
- `apps/admin-web/src/pages/*` — every page is a placeholder wired into routing/auth-guard already
