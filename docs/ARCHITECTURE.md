# Architecture — Village Security & Community App

Status: backend + admin-web scaffold complete and validated against a real
PostgreSQL instance (see "Validated during scaffolding" in §6); mobile
(`apps/mobile`) scaffolded and typecheck-validated in a later round (§7) —
screens are TODO stubs, not yet implemented. Phase 2 (Chat, Maintenance,
Transport Directory — §8) is at the **planning/schema stage**: architecture
decisions are made, `schema.prisma` is updated and migrated against a real
local Postgres, but no module code (controller/service/DTO) or UI exists yet
— that's the next Dev agent's work, scoped in
[`PHASE2_BACKLOG.md`](./PHASE2_BACKLOG.md). Source of truth for product
scope: [`village-security-app-spec.md`](../village-security-app-spec.md).
Source of truth for MVP task breakdown: [`MVP_BACKLOG.md`](./MVP_BACKLOG.md).
Source of truth for Phase 2 task breakdown: [`PHASE2_BACKLOG.md`](./PHASE2_BACKLOG.md).

This document exists so a Dev agent can pick up any module and implement it
without re-deriving the multi-tenant/RLS pattern, the module boundaries, or
the reasoning behind the scaffold's dependency choices.

---

## 1. Repo layout

```
apps/
  backend/                 NestJS API
    prisma/
      schema.prisma        full ER model (spec 3.2), camelCase fields @map'd
                            to spec's exact snake_case column names
      sql/rls-policies.sql source of truth for RLS policy text (see §3)
      migrations/           committed — includes the applied RLS migration
    src/
      main.ts
      app.module.ts         wires CommonModule + registers TenantContextMiddleware
      common/               cross-cutting infra (see §2)
      modules/              one folder per Epic 2-4 spec module (see §2)
  admin-web/                React + Vite admin dashboard
    src/
      pages/                one file per spec 1.3 / backlog Epic 5 screen
      routes/                ProtectedRoute (client-side UX guard only)
      lib/                  api.ts (fetch wrapper), auth.ts (session storage)
  mobile/                   Expo (React Native + TypeScript) — Resident AND
                            Guard app in one codebase, see §7
    App.tsx                 AuthProvider + RootNavigator
    src/
      lib/                  api.ts, auth.ts (expo-secure-store), types.ts,
                            config.ts — mirrors admin-web/src/lib, async
      context/               AuthContext.tsx (session state)
      navigation/             RootNavigator (role switch), AuthNavigator,
                            ResidentTabNavigator, GuardTabNavigator
      screens/
        auth/                 PhoneLogin, OtpVerify (shared)
        resident/             one file per spec 1.1 screen
        guard/                 one file per spec 1.2 screen
      components/             shared widgets (e.g. SosHoldButton)
infra/
  postgres/init/01-init.sql runs once on first container start — creates the
                            non-superuser `village_app` DB role RLS needs
docker-compose.yml          local Postgres only (backend/admin-web run via npm)
```

### ADR-001 — Monorepo tooling: plain npm workspaces

**Decision:** `apps/*` under npm workspaces (see root `package.json`), no
Nx/Turborepo/pnpm.

**Why:** two apps, one team, 6-8 week MVP timeline (spec §4). Nx/Turborepo
earn their keep once you have shared internal packages, remote build
caching needs, or many apps — none of which apply yet. npm workspaces need
zero extra tooling and every Node dev already knows them.

**Revisit when:** a third app appears (e.g. a shared `packages/types` for
DTOs shared between backend and admin-web), or CI build times become a
problem — Turborepo's remote caching is the natural upgrade path then.

---

## 2. NestJS module boundaries

| Module | Owns (Prisma models) | Key endpoints (spec 3.3) | Depends on |
|---|---|---|---|
| `common/` | — (infra only) | `GET /health` | — |
| `auth` | `User` (also reads `Village`, `House`) | `POST /auth/login`, `POST /auth/refresh` | `common` |
| `visitor-pass` | `VisitorPass` | `POST /visitor-passes`, `PATCH /visitor-passes/:id/revoke`, `GET /visitor-passes/:token` | `common`, `auth` (JWT) |
| `entry-log` | `EntryLog` | `POST /entry-logs`, `PATCH /entry-logs/:id/confirm-exit`, `GET /entry-logs` | `common`, `visitor-pass` (pass status transitions) |
| `announcement` | `Announcement`, `AnnouncementRead` | `POST /announcements`, `GET /announcements`, `POST /announcements/:id/read` | `common` |
| `sos` | `SosAlert` | `POST /sos-alerts`, `PATCH /sos-alerts/:id/acknowledge` | `common`, `guard-shift` (reads on-duty roster) |
| `guard-shift` | `GuardShift` | `POST /guard-shifts`, `PATCH /guard-shifts/:id` | `common` |

`common/` is not a spec module — it's the shared infrastructure every other
module sits on top of:

```
common/
  prisma/       PrismaService (base client), PrismaModule (@Global)
  rls/          tenant-context.ts, tenant-context.middleware.ts,
                rls.interceptor.ts  — the whole multi-tenant pattern, §3
  guards/       JwtAuthGuard, RolesGuard — registered globally (APP_GUARD)
  decorators/   @Public(), @Roles(...), @CurrentUser()
  health/       HealthController (GET /health, DB connectivity smoke check)
  common.module.ts  wires all of the above + JwtModule + ThrottlerModule
```

**Rule every module follows:** controllers/services never inject
`PrismaService` directly for tenant data. They call
`getTenantPrismaClient()` from `common/rls/tenant-context.ts`, which returns
a Prisma client already scoped to the request's village via Postgres RLS
(§3). `PrismaService` is injected directly only by `RlsInterceptor` itself,
`HealthController`, and any genuinely cross-tenant code (none exists yet in
MVP scope).

---

## 3. Multi-tenant Row-Level Security — the actual pattern

Spec 3.2 requires that tenant data can never leak across villages **even if
application code has a bug** — filtering by `village_id` in every Prisma
query is not enough on its own, because it only takes one missed `WHERE`
clause in one service method to leak another village's data. The fix is to
enforce isolation at the database layer with PostgreSQL Row-Level Security,
so a forgotten filter fails closed (zero rows) instead of leaking.

### 3.1 The three pieces

1. **A non-superuser DB role.** PostgreSQL superusers (and any role with
   `BYPASSRLS`) ignore RLS policies unconditionally, no matter what the
   policy says. `infra/postgres/init/01-init.sql` creates `village_app`
   (`NOSUPERUSER`, `NOBYPASSRLS`) the first time the Postgres container's
   data volume is created, and the backend's `DATABASE_URL` connects as
   that role — never as the bootstrap `postgres` superuser.

2. **RLS policies on every tenant table**, in
   `apps/backend/prisma/sql/rls-policies.sql`:

   ```sql
   ALTER TABLE houses ENABLE ROW LEVEL SECURITY;
   ALTER TABLE houses FORCE ROW LEVEL SECURITY;  -- applies even to the table owner

   CREATE POLICY tenant_isolation ON houses
     USING (village_id = NULLIF(current_setting('app.current_village_id', true), '')::uuid)
     WITH CHECK (village_id = NULLIF(current_setting('app.current_village_id', true), '')::uuid);
   ```

   `FORCE` matters here specifically because `village_app` *owns* every
   table (it ran `prisma migrate`) — table owners bypass RLS by default,
   `FORCE` closes that hole. `current_setting(..., true)` (the `true` =
   `missing_ok`) returns `NULL` instead of erroring when the session
   variable was never set on a connection **that has never once had that
   GUC set in its lifetime**. `village_id = NULL` evaluates to `NULL`
   (falsy), so such a connection sees **zero rows**, not an error and not
   all rows. Default-deny by construction.

   **Pooled-connection edge case (fixed 2026-08-28, migration
   `20260828090000_rls_empty_string_village_id_deny`):** Postgres does not
   reset a session GUC back to "never set" once any transaction on that
   *pooled* connection has called `set_config('app.current_village_id', ...,
   true)` — which happens on essentially every real request, since
   `RlsInterceptor` does this globally. A **later** transaction on the same
   pooled connection that forgets to set it again gets `current_setting(...,
   true) = ''` (empty string), not `NULL` — and `''::uuid` **raises a
   Postgres error** rather than evaluating to `NULL`. Both an error and zero
   rows are equally fail-closed (no wrong-tenant data is ever returned
   either way), but only zero rows matches the "default-deny, degrades
   predictably" behavior this document commits to. The policy expression is
   therefore `NULLIF(current_setting('app.current_village_id', true),
   '')::uuid`, not the bare cast: `NULLIF` collapses the empty-string case
   back to `NULL` *before* the `::uuid` cast runs, so both "never set" and
   "reset to empty by a reused pooled connection" now behave identically —
   **zero rows, never a thrown error** — for every RLS table, regardless of
   connection reuse state. See `prisma/sql/rls-policies.sql` for the exact
   policy text and `test/rls.e2e-spec.ts` for the e2e proof.

   This is generated for every table in one `DO $$ ... $$` loop over an
   explicit table list — see the file for the full list (17 tables). The
   file's own header comment explains how to extend it when a new tenant
   table is added to `schema.prisma`.

3. **`SET LOCAL app.current_village_id` once per request**, inside a
   transaction. `SET LOCAL` (not plain `SET`) is essential: Prisma uses a
   connection pool, so a session-level `SET` would leak into whatever
   *other* request reuses that pooled connection next — a real cross-tenant
   leak. `SET LOCAL` is transaction-scoped and is automatically undone on
   commit/rollback, so it cannot leak between requests no matter how the
   pool recycles connections.

### 3.2 How it's wired into NestJS (already implemented)

Two files do this, in two stages of the request lifecycle:

**Stage 1 — `TenantContextMiddleware`**
(`apps/backend/src/common/rls/tenant-context.middleware.ts`), applied to
every route in `app.module.ts`'s `configure()`. Decodes the Bearer JWT
(payload: `sub`, `villageId`, `role`, `houseId` — per spec 3.3) and
publishes those claims into an `AsyncLocalStorage` (`tenantClaimsStorage`).
It does **not** reject the request on a missing/invalid token — that split
(authentication vs. authorization) is deliberate; `JwtAuthGuard` handles
rejection.

**Stage 2 — `RlsInterceptor`**
(`apps/backend/src/common/rls/rls.interceptor.ts`), registered globally via
`APP_INTERCEPTOR`. For any request that has tenant claims, it opens a
Prisma interactive transaction, runs `SELECT set_config('app.current_village_id', $1, true)`
(equivalent to `SET LOCAL`) as the first statement, then runs the rest of
the request (the controller handler and everything it calls) **inside**
that same transaction via a second `AsyncLocalStorage`
(`tenantRequestStorage`) that holds the transactional client:

```ts
return from(
  this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_village_id', ${claims.villageId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${claims.userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_role', ${claims.role}, true)`;
    return tenantRequestStorage.run({ ...claims, tx }, () => lastValueFrom(next.handle()));
  }),
);
```

Services then call `getTenantPrismaClient()` (from
`common/rls/tenant-context.ts`) instead of injecting `PrismaService`, which
returns that transactional, RLS-scoped client:

```ts
// inside a module service
const houses = await getTenantPrismaClient<PrismaClient>().house.findMany();
// no `where: { villageId }` needed — Postgres RLS already filters it,
// and even if a Dev agent forgets the filter, the DB won't leak.
```

`getTenantPrismaClient()` throws loudly if called outside a request that
went through `RlsInterceptor`, rather than silently falling back to the
unscoped client — a cron job or genuinely cross-tenant script must use
`PrismaService` directly and say so explicitly.

### 3.3 Known trade-off (documented, not accidental)

Wrapping the whole request in one transaction means a handler that awaits a
slow external call (FCM push, SMS, S3 upload) mid-request holds a pooled DB
connection for that entire duration. For MVP traffic this is fine and buys
strong correctness guarantees for free. If a module needs a slow external
call, do the DB read/write first, let the transaction close, *then* make
the external call — don't hold the transaction open across it. Revisit if
connection pool exhaustion shows up under load (the fix then is likely
per-operation transactions instead of per-request, at the cost of losing
the "one `SET LOCAL` covers the whole request" simplicity).

### 3.4 One deliberate extension beyond the spec's literal text

Spec 3.2's prose names `visitor_passes, entry_logs, sos_alerts,
maintenance_tickets, bookings, payments` as tables that should denormalize
`village_id` for RLS. `schema.prisma` denormalizes it onto **every**
tenant-owned table, including ones the prose didn't list (`house_members`,
`chat_participants`, `chat_messages`, `bookings`, `payments` all get it even
where the ASCII ER omitted it) — so the RLS policy loop in §3.1 is uniform
across the whole schema rather than special-cased per table. Simpler to
reason about and impossible to accidentally skip a table when adding new
features.

---

## 4. ADR — ORM: Prisma

**Decision:** Prisma (`@prisma/client` + `prisma` CLI), pinned to the
**6.19.3** line — not the newest available (7.10.0 at scaffold time).

**Why Prisma:** type-safe generated client (matches spec 3.1's Node/NestJS
choice well), first-class migration workflow (`prisma migrate dev`/
`deploy`), and schema-as-code that doubles as living documentation of the
ER model in spec 3.2 — all of which this scaffold leans on directly
(`schema.prisma` IS the ER model, `prisma/migrations/` IS the applied
history).

**Why 6.x, not 7.x, despite 7.x being "latest" on npm:** Prisma 7
introduces a breaking change — the classic `datasource { url = env(...) }`
block in `schema.prisma` is **no longer supported**; it requires a new
`prisma.config.ts` file and passing a driver `adapter` to the
`PrismaClient` constructor instead. This was discovered directly during
scaffolding: `prisma generate` on 7.10.0 failed validation against the
schema style this whole document assumes. That's a materially different
architecture (every `new PrismaClient()` call site changes, migrate
tooling changes) that a Dev agent shouldn't be handed mid-implementation
without a deliberate decision to adopt it. 6.19.3 is the last version on
the well-documented, widely-known `schema.prisma`-with-`url` pattern that
this scaffold (and most existing Prisma+NestJS material) uses.

**Revisit when:** ready to deliberately migrate to Prisma 7's driver
adapter model — do it as its own isolated change, not bundled into a
feature module PR.

### ADR — NestJS: pinned to 11.x, not 12.x

Same class of issue: `@nestjs/core@12.0.1` is the newest on npm, but
`@nestjs/throttler` (needed for spec 3.4's rate-limiting requirements) has
not yet published a version supporting Nest 12 (`^11.0.0` is its current
peer-dep ceiling) — `npm install` fails to resolve with Nest 12 pinned.
Every other package this scaffold needs (`@nestjs/config`, `@nestjs/jwt`,
`@nestjs/swagger`, `@nestjs/cli`) has a stable 11.x-compatible release, so
the whole stack is pinned to 11.x rather than mixing a Nest-12 core with an
11-only throttler (which `--legacy-peer-deps` would paper over, not fix).
Bump the whole set together once `@nestjs/throttler` catches up.

---

## 5. Security notes carried into the scaffold

Everything below is spec 3.4's requirements, mapped to where they live now
vs. what's still a Dev agent TODO.

| Spec 3.4 requirement | Status |
|---|---|
| RBAC on every endpoint | `RolesGuard` + `@Roles()` implemented globally; each module applies `@Roles()` per its own endpoints (TODO per module) |
| `village_id` never trusted from client | Enforced structurally — it only ever comes from the JWT via `TenantContextMiddleware` → RLS; no endpoint TODO lets a client pass `village_id` |
| QR JWT signed + separate from auth JWT | `QR_TOKEN_SECRET` reserved in `.env.example`, separate from `JWT_ACCESS_SECRET` — visitor-pass module TODO to actually sign/verify with it |
| Sensitive photo storage separated + short retention | Two bucket env vars reserved (`S3_BUCKET_ENTRY_LOGS`, `S3_BUCKET_SENSITIVE_ID`) — entry-log module TODO to implement upload + 90-day auto-delete job |
| SOS rate-limit that never blocks a real emergency | `common/`'s global `ThrottlerModule` is a blunt app-wide default only — explicitly documented in `sos.module.ts`'s TODO as NOT sufficient on its own; needs its own per-user-cooldown policy |
| Audit log for admin access to sensitive data | **Gap, not yet scaffolded** — spec 3.4 requires it but spec 3.2's ER overview has no `audit_log` table, so none was invented here. Dev agent (Epic 0) needs to design and add an `AuditLog` Prisma model + write path before this is done. |
| Offline scan / revocation sync for Guard app | Out of scope for this API-only MVP round (per `MVP_BACKLOG.md`) — visitor-pass module TODO leaves a design note for the stub endpoint |

---

## 6. Validated during scaffolding

This wasn't just written — it was run, against a real containerized
Postgres, to prove the RLS pattern actually holds:

1. `docker compose up -d db` → `infra/postgres/init/01-init.sql` ran
   automatically, created `village_app` (non-superuser) and the
   `village_security` database.
2. `prisma migrate dev --name init` applied the full schema from
   `schema.prisma` — 18 tables, all enums, all indexes — with zero errors.
3. `prisma/sql/rls-policies.sql` was applied as a second migration
   (`enable_rls`) — `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + policy
   creation succeeded on every table, including ones `village_app` itself
   owns.
4. `prisma/seed.ts` ran successfully — proving `WITH CHECK` accepts a
   correctly-scoped `INSERT` once `app.current_village_id` is set.
5. **The actual cross-tenant test:** inserted a second "control" village +
   house directly via `psql` as `village_app`. Ran `SELECT * FROM houses`
   (deliberately no `WHERE` clause) three ways:
   - scoped to village A (`SET LOCAL app.current_village_id = '<village A>'`)
     → returned **only** village A's house, not the control village's
   - with no `app.current_village_id` set at all → returned **zero rows**
   - (implicitly) proved `FORCE ROW LEVEL SECURITY` works even though
     `village_app` owns the `houses` table
6. `nest build` (backend) and `vite build` (admin-web) both succeed with no
   TypeScript errors.
7. The compiled backend was booted against the live database — `GET
   /health` returned `{"status":"ok","db":"connected"}` and `GET
   /docs-json` (Swagger) returned `200`.

Test data from step 5 was cleaned up afterward; the DB was left in a clean
seeded state (one sample village/admin/house) and the container stopped
(`docker compose down`, data volume preserved).

---

## 7. Mobile app (`apps/mobile`) — Expo, one codebase, role-based navigation

Status: scaffold only. Navigation, `lib/api.ts`/`lib/auth.ts`, and every
screen file exist and typecheck; every screen body is a TODO stub (same
"scaffold now, Dev agent implements later" pattern the backend/admin-web
scaffold used — see `MVP_BACKLOG.md`'s Epic 6/7 for the task breakdown).
Reuses 100% of the existing backend API — **no new endpoints were added for
mobile**, only two backend gaps were found and are reported (not fixed) in
Epic 6/7's "ข้อจำกัด backend" lists.

### ADR-002 — One Expo app for both Resident and Guard, not two apps

**Decision:** a single Expo (React Native + TypeScript) codebase at
`apps/mobile` serves both roles. After login, `RootNavigator`
(`src/navigation/RootNavigator.tsx`) reads `session.role` from `AuthContext`
and mounts `ResidentTabNavigator` or `GuardTabNavigator` — two completely
separate screen trees that happen to share one Auth stack, one
`lib/api.ts`, and one `lib/auth.ts`.

**Why not two apps (`apps/mobile-resident` + `apps/mobile-guard`):**
- Auth (phone+OTP login, JWT storage/refresh, session context) and the API
  client are identical between roles — spec 3.3's endpoints are the same
  backend for both. Two apps would either duplicate that code or force a
  third `packages/mobile-shared` package into the monorepo this early —
  exactly the kind of premature complexity ADR-001 (npm workspaces, no
  Nx/Turborepo) already argued against for the web side.
- The two role's screen trees (`src/screens/resident/`, `src/screens/guard/`)
  and navigators (`ResidentTabNavigator`, `GuardTabNavigator`) are still
  fully separate — there's no forced coupling of UI, only of
  auth/API/session plumbing. A Dev agent implementing the Guard scan screen
  never touches Resident screen files and vice versa.
- One app means one login screen a village needs to hand out (fewer support
  questions: "which app do I install?"), and one Expo/EAS project to
  configure, build, and later push OTA updates to — meaningfully less MVP
  ops overhead for a project already juggling backend + admin-web + mobile
  in one 6-8 week phase (spec §4).
- The realistic downside — Resident-only users carrying Guard code (and
  vice versa) in their bundle — is small at this app's size and is exactly
  what Hermes bytecode + Metro's tree-shaking of unreached screen modules
  mitigates; it's not zero cost, but far cheaper than the alternative's
  duplicated auth/API layer.

**Revisit when:** the two roles' feature sets diverge enough that shared
auth/API plumbing stops being the dominant shared surface area (e.g. Guard
gains a large offline-first data-sync layer Resident never needs) — split
into two apps then, reusing `lib/` as a `packages/mobile-shared` package at
that point (mirrors ADR-001's own "revisit when a third app needs shared
code" trigger).

### ADR-003 — Expo (managed workflow), React Navigation, not Expo Router

**Decision:** Expo SDK 57, TypeScript, `@react-navigation/native` +
`native-stack` + `bottom-tabs` for routing (not `expo-router`'s
file-based routing).

**Why Expo over bare React Native:** spec 3.1 explicitly recommends
React Native/Flutter; the team already has React skill from admin-web
(spec 3.1's own reasoning for React Native over Flutter). Expo's managed
workflow means no Xcode/Android Studio native project to maintain by hand —
this machine has no emulator installed (see task constraints), so a
scaffold that only needs to `npm install` + `tsc --noEmit` cleanly, without
ever invoking a native build, is the only kind of scaffold that can be
validated here at all. `expo-camera`'s `CameraView` gives QR scanning
(spec 1.2) as a built-in SDK component (no separate barcode library), and
`expo-notifications` + `expo-secure-store` cover push and secure session
storage without any native module hand-linking.

**Why React Navigation over Expo Router:** Expo Router's file-based routing
is the newer, increasingly-default choice, but it entangles the
Auth-vs-Resident-vs-Guard role switch (ADR-002) with the filesystem layout
in a way that's harder to reason about explicitly than
`RootNavigator`'s plain `if (!session) ... else if (role === 'RESIDENT')
...` branch. React Navigation's imperative navigator composition matches
how `apps/backend`'s module boundaries and `apps/admin-web`'s
`react-router-dom` routes are already reasoned about in this repo — one
more file (`RootNavigator.tsx`) you can read top-to-bottom instead of
inferring routing from directory structure. Revisit if the screen count
grows enough that file-based routing's reduced boilerplate starts to win.

### How it reuses / differs from admin-web's pattern

| Concern | admin-web (`apps/admin-web/src/lib`) | mobile (`apps/mobile/src/lib`) |
|---|---|---|
| API client | `api.ts` — fetch wrapper, 401 → refresh → retry, redirects via `window.location.href` | Same retry/refresh logic, but every session read is `await`ed (see below) and there's no `window.location` — an unrecoverable 401 calls `onSessionExpired()`, a callback `AuthContext` registers, so `RootNavigator` can swap back to the Auth stack |
| Session storage | `auth.ts` — `localStorage`, synchronous reads | `auth.ts` — `expo-secure-store` (iOS Keychain / Android Keystore), **async** reads — a phone is far more likely to be lost/stolen than an office workstation, so the 30-day refresh token needs OS-level encryption at rest, not plaintext `localStorage`-equivalent |
| Response types | `types.ts` — hand-kept in sync with Prisma models | Same file, copied and extended with `VisitorPass`/`VisitorPassScanResult` (types admin-web never needed since it has no QR scan screen) |
| Route guarding | `ProtectedRoute` component wrapping `react-router-dom` routes | `RootNavigator`'s session check plays the same role, structurally simpler since there's no nested route tree to guard, just one top-level switch |
| Both are UX-only guards | Neither is a security boundary — the backend's `JwtAuthGuard`/`RolesGuard` (`apps/backend/src/common/guards/`) is the real authority in both cases, per spec 3.4 | (same) |

### Screen-by-screen TODO map

Every file in `src/screens/resident/` and `src/screens/guard/` carries a doc
comment naming the exact backend endpoint(s)/DTO field names it must call —
written so a Dev agent can implement each screen without re-reading spec.md
or the backend source. Two design decisions were deliberately left open in
those comments rather than pre-decided here, since they're UI/product calls
rather than architecture ones:
- `ExitConfirmScreen.tsx`: whether guard exit-confirm reuses `ScanQrScreen`
  in an "exit mode" or is a fully separate manual list.
- `HomeScreen.tsx` (guard): whether a guard-shift on/off-duty toggle
  belongs on the Guard app itself or stays admin-web-only (admin-web's
  `GuardShiftsPage` already has one).

### Validated during this scaffolding round

- `npx create-expo-app apps/mobile --template blank-typescript`, then
  `npx expo install @react-navigation/native @react-navigation/native-stack
  @react-navigation/bottom-tabs react-native-screens
  react-native-safe-area-context expo-camera expo-secure-store
  expo-notifications expo-device react-native-qrcode-svg react-native-svg`
  — `expo install` (not plain `npm install`) resolves each package to the
  exact version compatible with SDK 57, matching how `expo-secure-store`'s
  config plugin got auto-registered into `app.json`.
- `apps/mobile` added to root `package.json`'s `workspaces` array; a root
  `npm install` (hoisting all three apps' `node_modules`) completed with no
  resolution conflicts against `apps/backend`/`apps/admin-web`'s existing
  dependency trees.
- `npm run typecheck --workspace apps/mobile` (`tsc --noEmit`, extending
  `expo/tsconfig.base`) — **zero errors** across `App.tsx`, every
  `lib/`/`context/`/`navigation/`/`screens/`/`components/` file.
- Re-ran `npm run build:admin` and `npm run build:backend` from the repo
  root after the workspace/hoisting change — both still succeed with no new
  TypeScript errors, confirming adding `apps/mobile` to the workspace didn't
  perturb either existing app's dependency resolution.
- Not run (no emulator on this machine, out of scope per the task): `expo
  start`, an actual Android/iOS build, or any on-device testing. That
  remains the Dev agent's first manual verification step before trusting
  the navigation wiring at runtime, not just at typecheck time.

---

## 8. Phase 2 — Chat, Maintenance, Transport Directory

Status: **planning + schema only**, done in this round. No
`src/modules/chat|maintenance|transport-provider/` exists yet — this section
gives a Dev agent the architecture decisions and the already-migrated schema
to build against. Task breakdown: [`PHASE2_BACKLOG.md`](./PHASE2_BACKLOG.md)
Epics 8-10.

### 8.1 ADR-004 — Chat real-time transport: Socket.io (`@nestjs/websockets`)

**Decision:** `@nestjs/websockets` + `@nestjs/platform-socket.io` (i.e.
Socket.io, not Firebase Realtime DB, and not raw `ws`). Add
`@nestjs/websockets@^11.x`, `@nestjs/platform-socket.io@^11.x`,
`socket.io@^4.8.x` to `apps/backend`, and `socket.io-client@^4.8.x` to both
`apps/admin-web` and `apps/mobile`. The `@nestjs/*` packages must stay on the
same 11.x line as `@nestjs/core` (see §4's Nest-11-not-12 ADR) — they're
released in lockstep by the Nest team, so no new peer-dep conflict is
expected.

**Why Socket.io over Firebase Realtime DB** (spec 3.1 offers both as
options): this stack is already fully Postgres + RLS centric — every other
module's authorization, tenant isolation, and audit trail runs through one
system (`getTenantPrismaClient()` + Postgres RLS, §3). Firebase Realtime DB
would fork that into two separate authorization/data systems with two
different security models to keep in sync (Firebase Security Rules vs.
Postgres RLS), for a project that has already invested heavily in making the
Postgres-RLS story airtight (§3's whole pooled-connection empty-string fix).
Socket.io keeps chat message persistence in the same Postgres tables
(`ChatMessage` etc.), queryable with the exact same Prisma/RLS pattern every
other module uses — one mental model, one audit surface, no added vendor
billing/quota, and it runs on the same self-hosted infra the rest of the
stack already assumes (spec 3.1's hosting row: AWS/GCP/DigitalOcean, no
Firebase project).

**Why Socket.io over raw `ws`:** Socket.io's room abstraction
(`socket.join(roomId)` / namespace broadcast) maps directly onto "a chat
room" — no need to hand-roll room membership tracking in memory. Its
automatic reconnection and fallback transport handling matters specifically
for the mobile client (residents/guards on flaky village wifi/cellular), and
`socket.io-client` works unmodified in both a Vite web app and Expo/React
Native — no extra native module linking, consistent with why Expo was chosen
for mobile in the first place (§7 ADR-003).

**Revisit when:** the backend needs to scale to multiple Node instances —
Socket.io's default in-memory adapter only broadcasts within one process; a
Redis adapter (`@socket.io/redis-adapter`) would be needed then. Out of
scope for Phase 2 (single-instance deployment, same assumption the rest of
this scaffold already makes).

### 8.2 ADR-005 — WebSocket authentication & RLS scoping

The whole RLS pattern in §3 is built around one HTTP request = one
middleware pass (`TenantContextMiddleware`) + one guard check
(`JwtAuthGuard`) + one transaction (`RlsInterceptor`). A persistent
WebSocket connection has no equivalent single-shot request lifecycle — it's
one connection carrying many discrete events over time — so each piece of
that pattern needs a WS-specific analogue, not a copy-paste:

1. **Handshake auth (connection-time, analogous to
   `TenantContextMiddleware` + `JwtAuthGuard` combined).** The client passes
   the access JWT via Socket.io's supported `auth` handshake field —
   `io(url, { auth: { token: accessToken } })` — not a header (avoids
   header-manipulation quirks on React Native's socket transport) and not a
   query string (leaks the token into server access logs). `ChatGateway`'s
   `handleConnection(socket)` decodes and verifies the token using the same
   `JwtService` config `TenantContextMiddleware` uses for REST, and either
   stores the resulting `TenantClaims` on `socket.data.claims` or calls
   `socket.disconnect(true)` immediately on failure. Unlike the HTTP split
   (middleware decodes without rejecting, guard rejects), there is no
   separate "reject" stage for a WS connection attempt — decode-and-reject
   happens in one place because Socket.io has no per-connection guard
   pipeline the way Nest HTTP has middleware → guards.

2. **Per-event authorization (analogous to `JwtAuthGuard` re-checked on
   every request).** Nest supports `@UseGuards`/`@UseInterceptors` on
   individual `@SubscribeMessage` handlers, same as HTTP route decorators.
   Every handler re-reads `socket.data.claims` (already verified at
   handshake) before doing anything — this is cheap since it's just an
   object read, not a re-verify.

3. **Per-event RLS scoping (analogous to `RlsInterceptor`'s per-request
   transaction).** This is the one that must NOT be hand-rolled separately
   in the gateway. `RlsInterceptor`'s transaction-open +
   `SET LOCAL app.current_village_id/current_user_id/current_role` sequence
   (§3.2) is extracted into a shared helper —
   `runInTenantTransaction(claims, fn)` in `common/rls/` — that both
   `RlsInterceptor` (HTTP) and a new `WsRlsInterceptor` (WS, applied per
   `@SubscribeMessage` handler) call. Reasoning: the entire point of
   centralizing RLS setup in one interceptor (§3) was so a Dev agent adding
   a new module can never forget a `SET LOCAL` call and accidentally leak
   cross-tenant data. Writing a second, separately-maintained copy of that
   three-line sequence directly inside `ChatGateway` would reintroduce
   exactly the class of bug RLS was built to make impossible — "one missed
   line in one code path." One shared helper, two callers, is the only
   version of this that keeps that guarantee.

4. **Room-level authorization is explicitly NOT covered by RLS.** RLS
   isolates by `village_id` only — it guarantees a user can never see another
   *village's* chat rows, but it does nothing to stop a resident from
   joining a *different resident's* direct chat room within the same
   village (both rows would pass the village-scoped policy). `ChatGateway`'s
   `join_room`/`send_message` handlers must explicitly query
   `ChatParticipant` for `(chatRoomId, userId)` membership before allowing a
   join or an emit — an application-layer check on top of RLS, not a
   replacement for it. This is called out explicitly because it's the first
   module in this codebase where RLS + a `@Roles()` check is **not**
   sufficient on its own (every REST module so far only needed
   village-level + role-level authorization; chat needs a third,
   room-level check).

5. **Token refresh mid-connection.** Access tokens are short-lived (Epic 1's
   `JWT_ACCESS_EXPIRES_IN`). Unlike a REST call, a live socket doesn't get a
   401-and-retry per event. Socket.io auto-reconnects on transport drop, but
   a proactively-expiring token needs the client to refresh via the existing
   `POST /auth/refresh` (same call `lib/api.ts`'s 401 handler already makes)
   *before* the reconnect attempt's handshake, not after a failed one — a
   Dev-agent TODO for both `admin-web`'s and `mobile`'s Socket.io client
   wrapper, not a backend concern.

### 8.3 Maintenance ticket schema decisions

`MaintenanceTicket` existed since the MVP round as a Phase-2-table-shape
placeholder (schema only, no module code) — two things about it needed a
real decision now that Phase 2 is actually being built out:

- **`category`: `String` → enum `MaintenanceCategory`.** Spec 2.4
  enumerates the category list literally
  (`ไฟฟ้า/ประปา/ถนน/อื่นๆ` → `ELECTRICAL/PLUMBING/ROAD/OTHER`), exactly the
  same shape every other spec-enumerated categorical field in this schema
  already took (`AnnouncementLevel`, `VisitorPassStatus`,
  `VisitorPassUsageType`, etc.) — the placeholder `String` was an
  oversight from before that convention was consistently applied to every
  new table, not a deliberate choice. Converted to match.
- **`assignedTo`: stays a free-text `String`, deliberately NOT a `User`
  FK.** Spec 2.4 says "แอดมินมอบหมายงานให้ทีมช่าง" (admin assigns to a repair
  team), but Phase 2's roadmap (spec §4) does not introduce a technician
  role or a technician-facing app/login — `UserRole` is still exactly
  `RESIDENT | GUARD | ADMIN`. Making `assignedTo` a FK to `User` would force
  inventing a whole technician account system (login flow, RBAC role,
  onboarding) with no corresponding product requirement in this phase — pure
  speculative scope. A free-text field (vendor/team name, filled in by the
  admin who already knows their contractors) fully satisfies the literal AC
  with zero speculative build-out. **Revisit when** a future phase gives
  technicians their own app access — at that point this becomes a real FK
  migration with a backfill step, not a schema surprise.
- **`ticketNumber` + `MaintenanceTicketCounter` — new.** Spec 2.4's AC
  literally requires "ระบบสร้างเลขที่ใบงาน (ticket)" — a human-facing ticket
  number, which the existing UUID `id` doesn't serve. `ticketNumber` is
  `@@unique([villageId, ticketNumber])` (unique per village, not globally —
  matches the same denormalized-tenant-scoping pattern as
  `@@unique([villageId, houseNo])` on `House`). Numbers are generated via a
  new one-row-per-village `MaintenanceTicketCounter` table, incremented
  atomically (`UPDATE ... SET last_seq = last_seq + 1 RETURNING last_seq`)
  inside the same RLS-scoped transaction as the ticket `INSERT` — a plain
  `SELECT COUNT(*) + 1` was deliberately rejected here because it races
  under concurrent ticket creation from the same village (two residents
  filing tickets in the same transaction window could both compute the same
  "next" number), which a dedicated atomic counter row does not.

### 8.4 Chat schema decisions

- **`ChatRoom.residentsCanPost` (new, `Boolean @default(false)`).** Spec
  2.3's group-chat AC is explicitly conditional: "แชทกลุ่มหมู่บ้าน (broadcast
  แบบ read-only จากแอดมิน **หรือ**เปิดให้คุยกันได้ตามตั้งค่า)" — the spec
  itself calls this a per-village *setting*, so it needed a column, not just
  application logic guessing at a hardcoded default. Only meaningful for
  `type = GROUP`; `DIRECT` rooms ignore it (both participants can always
  post, enforced in the gateway/service, not by this flag). Defaults to
  `false` (admin-only broadcast) — the safer, spec-first-listed behavior,
  and the one that requires zero extra moderation tooling to ship safely.
- **`ChatParticipant.lastReadAt` (new, `DateTime?`).** Supports an
  unread-count/badge on the resident app's chat tabs (spec 1.1's
  "นิติบุคคล"/"รปภ."/"กลุ่มหมู่บ้าน" tabs, and the home screen's general
  notification-badge pattern). A single per-room "read up to" timestamp was
  chosen over a per-message read-receipt table (the pattern `AnnouncementRead`
  uses) because spec 2.3, unlike spec 2.2's announcements, never asks for a
  literal read receipt — only an unread indicator is implied by the UI
  mockup — so the cheaper single-column-per-participant design is
  sufficient and avoids a row-per-message-per-participant table that would
  otherwise grow unbounded.
- **`ChatRoom`/`ChatParticipant`/`ChatMessage` otherwise unchanged** — the
  MVP-round placeholder shape (direct/group type, participant join table,
  message with optional image) was already correct for Phase 2's literal
  AC; no other columns were missing.

### 8.5 Transport Directory: new `TransportProvider` model

Spec 2.7 replaced the earlier "ทำเนียบลูกบ้าน" (resident directory) concept —
dropped for privacy/consent complexity — with an admin-curated phone book of
recommended motorcycle-taxi/taxi/van drivers. It is explicitly **not** a
ride-hailing API integration (no Grab/Bolt-style dispatch, no booking, no
live vehicle location) — residents see a list and tap `tel:` to call
directly, so the entire feature is a flat CRUD table:

```
TransportProvider (id, villageId, name, type[motorcycle/taxi/van/other],
                    phone, serviceArea, isActive, createdAt)
```

- `type` is a new enum `TransportProviderType`, values taken directly from
  spec 2.7's bracketed list.
- `serviceArea` is a single nullable free-text field covering both "พื้นที่
  ให้บริการ" and "หมายเหตุ (เช่น ราคาโดยประมาณ)" — spec 2.7 presents both as
  one AC bullet joined by "/", so splitting it into two columns would be
  over-fitting a distinction the spec itself doesn't draw.
- `isActive` and a hard `DELETE` are both modeled (not just one or the
  other) because spec 2.7 explicitly lists "เพิ่ม/แก้ไข/**ลบ**/เปิด-ปิดการ
  แสดงผล" as four separate admin actions — delete and deactivate are
  different operations in the spec's own words, not a single soft-delete
  concept.
- Indexed on `[villageId, isActive]` (the resident-facing "active only"
  list) and `[villageId, type]` (the optional filter-by-type AC).

### 8.6 Migrations applied this round

Two migrations were generated and applied against the real local Postgres
instance (`docker compose up -d db`), following the same `prisma migrate
diff --script` + hand-placed migration folder + `prisma migrate deploy`
workflow used for prior manually-authored migrations in this repo (e.g. the
RLS-empty-string fix, §3.1) — `prisma migrate dev`'s interactive prompt
doesn't run in this non-interactive environment:

1. `20260828145655_phase2_chat_maintenance_transport` — the schema changes
   in §8.3-8.5 (new enums, new columns, two new tables). Verified safe to
   apply directly (not `--create-only` deferred) because `maintenance_tickets`
   had zero rows in the local dev database at the time (no Phase 2 module
   code exists yet to have written any), so the new `NOT NULL` columns
   (`category`'s type change, `ticketNumber`) couldn't violate existing data.
2. `20260828145708_rls_phase2_tables` — extends the RLS policy loop (§3.1)
   to the two new tables (`maintenance_ticket_counters`,
   `transport_providers`) only, not a re-run of the full table list (the
   original `20260828072452_enable_rls` migration already covers every
   pre-Phase-2 table and is immutable history — see that migration's own
   comment). `prisma/sql/rls-policies.sql`'s `ARRAY[...]` was updated to
   include both new tables so it stays the correct living reference for the
   *current* full table list, even though it's no longer a literal 1:1
   mirror of one single migration file.

Both were verified directly against the running container: `\d+
transport_providers` in `psql` shows `Policies (forced row security
enabled)` with the same `tenant_isolation` policy text as every pre-existing
table, and `pg_class.relrowsecurity`/`relforcerowsecurity` both read `t` for
both new tables. `npx prisma generate` (client type regeneration) and `npm
run build` (root — `build:backend` + `build:admin`) both succeed with no
TypeScript errors; `npm run typecheck:mobile` also still passes (mobile
doesn't reference any Phase 2 model yet, but confirms the workspace-wide
dependency graph wasn't perturbed).
