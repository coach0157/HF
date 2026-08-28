# QA Report — Village Security & Community App (Backend MVP)

**Scope:** `apps/backend` — auth, visitor-pass, entry-log, announcement, sos,
guard-shift, common/audit, common/otp, and the `village_app_auth_lookup`
RLS-bypass role.
**Environment:** local Docker Postgres 16 (`docker-compose.yml`), migrations
applied through `20260828080000_grant_auth_lookup_role`, Node v24, npm
workspaces.
**Test artifacts added:** `apps/backend/test/support/test-helpers.ts` (shared
harness), `apps/backend/test/rls.e2e-spec.ts` (rewritten — was a
`describe.skip` TODO stub), `apps/backend/test/auth-lookup-role.e2e-spec.ts`
(new), `apps/backend/test/security-flows.e2e-spec.ts` (new). 35 e2e tests
total, all passing, both `--runInBand` and default parallel.

## 1. Build / lint / existing tests

| Check | Result |
|---|---|
| `npm run build` (`nest build`) | **Pass** — no TypeScript errors |
| `npm run lint` | **Fails to run** — `eslint` is not installed anywhere in the workspace (not in `package.json` devDependencies, not in `package-lock.json`, no `.eslintrc*`/`eslint.config.*` file exists). The `lint` script in `apps/backend/package.json` is dead configuration. Not a code-quality bug per se, but the backlog's Epic 0 DoD item "CI pipeline พื้นฐาน (lint, unit test, build)" is not actually satisfiable today. **Needs Dev/SA follow-up**, not something I patched — installing/configuring ESLint is a tooling decision, not a "small obvious fix." |
| `npm test` (unit tests, `apps/backend/src/**/*.spec.ts`) | **Zero unit test files exist.** MVP_BACKLOG.md calls for unit tests per epic (OTP expiry/reuse, JWT payload, RBAC guard, QR expiry/revoke/single-use, exit no-auto-close, target-scope filtering, read-receipt idempotency, SOS routing/acknowledge). None were written by Dev. I did not add unit tests (out of my assigned scope — I added e2e coverage instead, which exercises the same behavior end-to-end), but this is a real DoD gap to flag back. |
| `docker compose up -d db` + `prisma migrate status` | **Pass** — 4 migrations applied cleanly, schema up to date |

## 2. e2e tests written and results

All 35 pass. Breakdown:

### `rls.e2e-spec.ts` (5 tests) — DB-level cross-tenant isolation, no app code
Implements the file's own pre-existing TODO plan. Connects as `village_app`
(same non-superuser role the app uses), issues queries with **no** `WHERE
village_id = ...` clause against `houses`, `visitor_passes`, `users`.
- Scoped-but-unfiltered queries return only the scoped village's rows — **pass**.
- Query with tenant context never set — **pass** (see Finding A below for a nuance).
- Tenant context set to a nonexistent village UUID → zero rows, no error — **pass**.

### `auth-lookup-role.e2e-spec.ts` (10 tests) — the highest-risk item
Connects directly as `village_app_auth_lookup` (via `AUTH_LOOKUP_DATABASE_URL`)
and verifies the blast radius matches exactly what the migration comment
claims:
- **Can** read `id, village_id, phone, role, house_id, name` across villages (the intended cross-tenant lookup) — **pass**.
- **Cannot** read `password_hash` — **pass** (`permission denied for table users`).
- **Cannot** read `line_user_id` — **pass**.
- **Cannot** do an implicit `SELECT *` — **pass**.
- **Cannot** read `visitor_passes`, `audit_logs`, `houses`, `entry_logs` — **pass** (all 4, no grants exist on any other table).
- **Cannot** `UPDATE`, `DELETE`, or `INSERT` on `users`, despite having read access — **pass**.

I also manually verified this at the psql level before automating it (role
attributes `rolsuper=f, rolbypassrls=t, rolcreatedb=f`; exact column grant
list matches `id, village_id, phone, role, house_id, name` and nothing else;
zero rows in `information_schema.table_privileges` for any other table).
**Conclusion: this role is exactly as narrowly scoped as documented. No
leak of `password_hash` or any other table found.** This was the item
flagged as highest security risk going in, and it holds up under adversarial
testing.

### `security-flows.e2e-spec.ts` (20 tests) — real HTTP, real JWTs, full app
- **Cross-tenant isolation via API** (4 tests): village A cannot revoke village B's pass (404), cannot view village B's user (404), cannot see/read village A's entry logs from village B (excluded from list, 404 on direct read), cannot see village A's SOS alerts from village B. All **pass**.
- **RBAC 403** (6 tests): resident blocked from creating announcements, acknowledging SOS, listing guard-shifts, creating users; guard blocked from creating a visitor pass; unauthenticated request gets 401 (not 403). All **pass**.
- **Exit-confirm flow, no auto-close** (3 tests): guard re-scanning the same QR at the exit gate returns `alreadyEntered: true` and `exitTime` stays `null` — confirmed both from the re-scan response and a fresh `GET`; only the explicit `PATCH /entry-logs/:id/confirm-exit` sets `exitTime`; confirming twice is rejected (400); resident-confirm path also works and is correctly rejected cross-tenant (404). All **pass**. This is the module's most safety-critical rule and it holds.
- **QR revoke** (2 tests): a revoked pass fails both `GET /visitor-passes/:token` (scan) and `POST /entry-logs` (entry attempt) with 403, even though `validTo` hasn't passed yet; revoke is idempotent. All **pass**.
- **SOS routing** (1 test): an on-duty guard is in `routedToGuardUserIds`; a guard with a *closed* (`OFF_DUTY`, `shiftEnd` set) shift is excluded — this specifically proves routing checks live status, not just "ever had a shift." On-duty guard can acknowledge. All **pass**.
- **Audit log** (1 test): admin revoking a resident's pass produces exactly one `audit_logs` row (`action=REVOKE_VISITOR_PASS_OTHER_USER`, correct `actorUserId`/`resourceType`); the same resident revoking their *own* pass produces zero rows for that resource, matching the code's intended signal-to-noise design. **Pass**.
- **Multi-village phone (documented Dev gap)** (1 test): login without `villageId` when a phone exists in 2 villages returns 409 with both candidates; retrying with `villageId` succeeds. Confirms this fails closed (never silently picks a village) rather than actually being an unhandled gap. **Pass**.

## 3. Bugs found

### Found in my own test harness (fixed, not a product bug)
`.overrideGuard(ThrottlerGuard)` (documented NestJS testing API) did not
actually intercept requests when I first wrote the suite — real
`ThrottlerException` 429s fired because the global `APP_GUARD`-registered
`ThrottlerGuard` kept its real rate limits. I did not chase down the exact
Nest/`@nestjs/throttler` version interaction (out of scope), and worked
around it with a test-only prototype patch
(`ThrottlerGuard.prototype.canActivate = async () => true` inside
`security-flows.e2e-spec.ts`'s `beforeAll`). This only affects the test
process; no production code changed. Flagging in case a future test author
hits the same surprise.

### Finding A — RLS "default-deny" is not always silent (behavior gap vs. ARCHITECTURE.md, not a leak)
`docs/ARCHITECTURE.md` §3.1 states that a connection which never set
`app.current_village_id` gets `NULL` from `current_setting(..., true)`, so
the RLS `USING` clause evaluates to false and the query returns **zero
rows, not an error**. I verified via psql that this is only true for a
Postgres backend connection that has *never once* had that custom GUC set
in its lifetime:

```
BEGIN; SELECT set_config('app.current_village_id','...',true); COMMIT;
BEGIN; SELECT current_setting('app.current_village_id', true);  -- returns '' , NOT NULL
```

Once any transaction on a pooled connection has set it (which happens on
essentially every real request, since `RlsInterceptor` does this globally),
Postgres keeps a per-connection placeholder for that GUC name. A later
transaction on the **same connection** that forgets to set it gets `''`
(empty string), not `NULL` — and `''::uuid` **raises a Postgres error**
rather than evaluating to `NULL`/false. In the app this surfaces as a 500,
not a silent empty result.

**This is not a cross-tenant data leak** — an error is exactly as
fail-closed as zero rows; no wrong-tenant data is ever returned either way.
But it means: (1) the specific behavior validated and written up in
ARCHITECTURE.md §6 step 5 was only true on a fresh connection right after
container start, and will not reproduce that way once the pool is warmed
by real traffic; (2) any future cron job / genuinely-cross-tenant script
that uses `PrismaService` directly (which the architecture explicitly
permits and expects — `getTenantPrismaClient()`'s own error message says
so) and forgets to `SET LOCAL app.current_village_id` will most likely
crash with a raw Postgres error rather than degrade gracefully to "no
rows." Recommend SA either (a) accept this as intended (errors ARE
fail-closed) and correct the doc's wording, or (b) change the RLS policy to
`COALESCE(current_setting(...), '')` style with an explicit sentinel that
never matches a real UUID and never raises. I did not change the RLS policy
myself — that's a schema/security-design decision, not a small obvious fix.
My e2e tests (`rls.e2e-spec.ts`, `auth-lookup-role.e2e-spec.ts`) were
adjusted to assert the real fail-closed property (zero rows **or** a
thrown error, never real data) so they're deterministic regardless of
connection reuse state, and the nuance is documented inline in both files.

### Everything else Dev self-reported as a known gap — confirmed still true, not touched
Per the task's brief, these were already disclosed by Dev and are outside
"small obvious bug" territory, so I verified them and left them for
Dev/SA rather than fixing:
- FCM push / SMS are stubs (no credentials in `.env`) — confirmed, `TODO`
  comments in `entry-log.service.ts`, `sos.service.ts`,
  `announcement.service.ts`.
- OTP store and refresh-token *verification cache* pattern: OTP is
  in-memory (`OtpService`), confirmed single-instance-only — will not work
  across horizontally-scaled backend instances. Refresh tokens themselves
  ARE persisted in Postgres (`refresh_tokens` table), so only the OTP
  short-lived challenge is in-memory, not the whole auth session.
- `SensitivePhotoCleanupService` deletes the file from disk after 90 days
  but does not null `entry_logs.photo_url` afterward — confirmed by reading
  the code; the class's own doc comment already flags this.
- Multi-village phone → 409: confirmed working as designed and tested
  above (not a bug, a deliberate disambiguation UX).
- `eslint` not installed (see §1) — this one was **not** previously called
  out by Dev; new finding from this QA pass.
- No unit tests exist (see §1) — this one was **not** previously called
  out by Dev either; new finding.

No RBAC, cross-tenant, exit-confirm, QR-revoke, SOS-routing, or audit-log
bugs were found — every acceptance criterion I was specifically asked to
adversarially test held up.

## 4. Go / No-Go recommendation for MVP

**Conditional GO for a staging/pilot deploy, NOT yet for production with
real end users.**

What's solid: the multi-tenant RLS pattern (including the deliberately
risky `BYPASSRLS` auth-lookup role) is correctly implemented and holds up
under adversarial API-level and DB-level testing — this was the single
highest-risk design decision in the system and it checks out completely.
Core MVP business logic (QR lifecycle, no-auto-close exit confirmation, SOS
on-duty routing, RBAC, audit logging for sensitive admin actions) all match
their spec'd acceptance criteria with no discrepancies found.

Before a real (non-pilot) production launch, close these first:
1. **FCM/SMS wiring** — currently no notification actually reaches anyone (push-to-resident-on-scan, emergency SMS fallback, SOS real-time delivery are all unwired stubs). This is core to the MVP's value proposition ("แจ้งเตือนทันทีเมื่อแขกมาถึง", SOS อยู่ในสเปก 2.2) — not safe to call MVP-complete without it.
2. **OTP store → Redis (or equivalent)** before running more than one backend instance — current in-memory store breaks OTP verification under horizontal scaling / rolling deploys.
3. **Write the unit tests the backlog calls for** — e2e coverage from this pass proves the integrated behavior is correct today, but unit tests are what catch a regression cheaply in CI before it reaches an integration test; right now there is no unit-level safety net at all.
4. **Get `eslint` actually working** in CI, or drop the dead `lint` script — shipping a script that fails is worse than not having one.
5. Decide on Finding A (§3) — at minimum fix the ARCHITECTURE.md wording; ideally harden the RLS policy so a forgotten context degrades predictably (error is acceptable, but should be a deliberate, documented choice, not a Postgres quirk nobody decided on).
6. Sensitive-photo cleanup should null `photo_url` after deletion (small, well-scoped fix — safe for Dev to pick up quickly).

None of the above are regressions introduced by this QA pass — they're
pre-existing, mostly self-disclosed gaps, restated here with verification
status so Dev/SA can prioritize before a production go-live.

---

## QA pass 2 — Admin Dashboard (`apps/admin-web`) + new backend surfaces it needs

**Scope:** `apps/admin-web` (React+Vite, all pages/lib) against `apps/backend`,
specifically the two backend additions Dev built solely to support the
dashboard and that had never been through QA: `src/modules/house/*` (new
module) and `PATCH`/`DELETE /announcements/:id` (new endpoints on an
existing module). Two items Dev explicitly flagged for extra scrutiny:
(1) the announcement edit form's house-selection preload, (2)
`OTP_DEV_BYPASS_CODE`'s `NODE_ENV=production` guard.

### 1. Build / lint / regression tests

| Check | Result |
|---|---|
| `npm run build` (root — backend + admin-web) | **Pass**, no errors, before and after this pass's changes |
| `npm run lint` (`apps/backend`) | **Pass — 0 errors**, 7 pre-existing-style warnings (`require-await`/`no-floating-promises`), same warning pattern as before this pass. (Earlier QA pass 1 reported `eslint` as not installed at all — that's since been fixed; not something this pass touched.) |
| `npm test` (unit, `apps/backend`) | **44/44 pass**, 7 suites — no regressions from House module or announcement PATCH/DELETE |
| `npm run test:e2e` (`apps/backend`) | **60/60 pass**, 5 suites (35 pre-existing + 2 new files added this pass, see §2) — no regressions |

### 2. New backend test coverage added this pass

- **`src/common/otp/otp.service.spec.ts`** (new, 4 unit tests) — exercises the
  real `OtpService` class (not mocked) with a real `ConfigService` stub, to
  directly prove the `NODE_ENV` gate on `OTP_DEV_BYPASS_CODE`.
- **`test/otp-prod-bypass.e2e-spec.ts`** (new, 2 e2e tests) — boots the full
  `AppModule` over real HTTP with `process.env.NODE_ENV = "production"` set
  *before* `ConfigModule` compiles (and with `OTP_DEV_BYPASS_CODE=000000`
  still present, mirroring the exact misconfiguration risk: the var leaking
  into a prod-like environment). Calls the real `/auth/otp/request` +
  `/auth/login` endpoints.
- **`test/house-announcement-mgmt.e2e-spec.ts`** (new, 23 e2e tests) — the
  requested RBAC + cross-tenant coverage for `GET/POST /houses` and
  `PATCH/DELETE /announcements/:id`: resident/guard get 403 on admin-only
  house/announcement mutations, unauthenticated gets 401, a village never
  sees or can mutate another village's houses/announcements (404, not just
  filtered out), duplicate `houseNo` is 409-scoped per-village not globally,
  basic DTO validation (bad latitude, missing required field, bad enum) is
  400. Also includes a regression test for the target-house-preload fix
  (§3 below) proving the round trip is now exactly what the admin asked for.

### 3. Bug found and fixed — announcement HOUSE-scope edit silently dropped previously-targeted houses

**Confirmed as a real, user-impacting bug**, exactly as Dev suspected when
flagging it, and reproduced live in a real browser (Playwright, Chromium)
against the running admin-web + backend dev servers, not just by reading
code:

- Root cause: `AnnouncementService.list()`
  (`apps/backend/src/modules/announcement/announcement.service.ts`) never
  included the `AnnouncementTarget` relation, so `GET /announcements` never
  told the frontend which houses a `targetScope=HOUSE` announcement already
  targeted.
- `AnnouncementsPage.tsx`'s `startEdit()` therefore always initialized the
  edit form's `targetHouseIds` to `[]` — every house checkbox rendered
  unchecked on edit, regardless of the announcement's real state.
- `AnnouncementService.update()` replaces `AnnouncementTarget` rows wholesale
  whenever `targetHouseIds` is present in the PATCH body
  (`deleteMany` then `createMany`) — and the frontend always sends
  `targetHouseIds` when `targetScope === 'HOUSE'` (it's a required field in
  the form). So: admin opens edit on a HOUSE-scope announcement targeting
  houses A+B, sees an all-unchecked house list, re-checks only the house(s)
  they remember/notice, saves — house B (or any house they didn't
  re-check) is silently deleted from the target list with no warning. This
  is silent data loss on a P0 MVP screen (announcement targeting), not a
  cosmetic UX issue.
- **Fix applied** (small, contained, no business-logic change beyond
  "return the data that already exists"):
  - Backend: `AnnouncementService.list()` now `include`s
    `targets: { select: { houseId: true } }` in both the admin and
    resident/guard query branches, and flattens the result to a
    `targetHouseIds: string[]` field via a new private
    `flattenTargetHouseIds()` helper.
  - Frontend: `lib/types.ts`'s `Announcement` interface gained
    `targetHouseIds: string[]`; `AnnouncementsPage.tsx`'s `startEdit()` now
    seeds `form.targetHouseIds` from `a.targetHouseIds` instead of `[]`.
  - No change to `update()`'s "replace wholesale" semantics — that behavior
    is fine and arguably correct *given* an accurate preload; the bug was
    purely that the preload had no data to work with.
- **Verified fixed live in a real browser** (Playwright/Chromium, headless,
  driving the actual Vite dev server + Nest dev server, not a mock): logged
  in as the seeded admin (`0800000000`), created a HOUSE-scope announcement
  targeting 2 real houses, opened its edit form — both house checkboxes were
  pre-checked (previously both would render unchecked). Then deliberately
  unchecked one house and saved; re-opening edit confirmed the kept house
  stayed checked and the removed house stayed unchecked — i.e. the admin's
  actual intent now round-trips correctly instead of being silently
  overwritten by whatever happened to be checked. Also confirmed via
  `test/house-announcement-mgmt.e2e-spec.ts`'s dedicated regression test
  (`GET /announcements` returns `targetHouseIds` matching what was created;
  a partial PATCH re-selection produces exactly that new set, nothing more
  dropped than what was asked).
- Files changed: `apps/backend/src/modules/announcement/announcement.service.ts`,
  `apps/admin-web/src/lib/types.ts`, `apps/admin-web/src/pages/AnnouncementsPage.tsx`.

### 4. OTP dev-bypass code — `NODE_ENV=production` guard confirmed to work

**Confirmed safe.** `OtpService.verifyOtp()`
(`apps/backend/src/common/otp/otp.service.ts`) gates the bypass with:

```ts
const isDev = this.config.get<string>("NODE_ENV", "development") !== "production";
const matches = entry.code === code || (isDev && devBypass && code === devBypass);
```

This is correct: the bypass is only ever considered when `NODE_ENV !==
"production"`, regardless of whether `OTP_DEV_BYPASS_CODE` is set. Verified
two ways, both new to this pass:
- **Unit level** (`otp.service.spec.ts`): the real `OtpService` class,
  wired with a real `ConfigService`, accepts the bypass code under
  `NODE_ENV=test`/unset (defaults to development) but rejects it outright
  under `NODE_ENV=production` — even with `OTP_DEV_BYPASS_CODE=000000`
  still configured (the exact scenario if Dev's local `.env` value ever
  leaked into a prod-like deploy). A non-bypass wrong code is also still
  correctly rejected in production mode (i.e. production doesn't just
  "reject everything" — normal OTP verification still works).
- **HTTP/e2e level** (`otp-prod-bypass.e2e-spec.ts`): booted the real
  `AppModule` with `process.env.NODE_ENV` actually set to `"production"`
  for that test process (set before `ConfigModule` compiles), and drove the
  real `POST /auth/otp/request` + `POST /auth/login` endpoints. Logging in
  with `otp: "000000"` (the bypass value) returns `401 Unauthorized` under
  production config, exactly like any other wrong code would.

No code change was needed here — Dev's existing guard is correctly
implemented. This closes out the specific risk flagged in the task brief.

### 5. House module + Announcement PATCH/DELETE — RBAC / RLS / validation review

Read `apps/backend/src/modules/house/*` end to end (new module, never
QA'd) and the announcement PATCH/DELETE additions, plus wrote the 23 e2e
tests in §2 to adversarially confirm each claim below:

- **RBAC**: `HouseController` — `GET /houses`, `GET /houses/:id` are
  `@Roles("ADMIN", "GUARD")`; `POST /houses` is `@Roles("ADMIN")` only.
  `AnnouncementController`'s new `PATCH`/`DELETE /announcements/:id` are
  both `@Roles("ADMIN")`. All match MVP_BACKLOG.md Epic 5's intent (admin
  manages houses/announcements; guard only needs read access to houses for
  context, e.g. SOS house-number lookups). Confirmed by test: resident gets
  403 on all four mutating/admin-only routes; guard gets 403 on
  `POST /houses` and both announcement mutations; unauthenticated gets 401
  everywhere.
- **RLS/tenant scoping**: every query in `house.service.ts` and the
  announcement service's `update()`/`remove()` goes through
  `getTenantPrismaClient()` — no raw/unscoped Prisma client usage found. No
  `PrismaService` direct-access escape hatch used anywhere in either
  module. Confirmed by test: village B cannot list, fetch-by-id, `PATCH`,
  or `DELETE` village A's houses/announcements (404 in every case, RLS
  hides the row rather than the app returning 403 — consistent with the
  rest of the codebase's established pattern, see QA pass 1's RLS
  findings). `houseNo` uniqueness is correctly scoped per-village
  (`@@unique([villageId, houseNo])`), not globally — same string is
  accepted in two different villages, rejected (409) only within the same
  one.
- **Input validation**: `CreateHouseDto` has `class-validator` decorators on
  every field (`houseNo` required + length-bounded, `zone`/`latitude`
  /`longitude`/`ownerUserId` optional but type/range-checked when present,
  lat/long bounded to real-world ranges). `UpdateAnnouncementDto` mirrors
  `CreateAnnouncementDto`'s validation with everything optional. Confirmed
  by test: out-of-range latitude (999) → 400, missing required `houseNo` →
  400, invalid `level` enum value on PATCH → 400, switching to
  `targetScope=ZONE` without `targetZone` on PATCH → 400.
- No new RBAC, RLS, or validation gaps found in either module.

### 6. UI test — resident/guard rejected from Admin Dashboard

Verified with the same Playwright/Chromium browser session as §3, against
the real running admin-web + backend dev servers (not mocked):

- Resident (`0811111111`) and guard (`0822222222`) logging in through the
  real login form (phone + dev-bypass OTP) both get the frontend's
  role-check rejection ("บัญชีนี้ไม่ใช่บัญชีแอดมิน...") and stay on
  `/login` — `LoginPage.tsx` correctly checks `res.user.role !== 'ADMIN'`
  and never calls `setSession()` for them.
- Unauthenticated direct navigation to a protected route
  (`/announcements`) redirects to `/login` — `ProtectedRoute.tsx` works.
  Confirmed at the **real security boundary**, not just the frontend
  convenience guard: a resident's real (valid, backend-issued) JWT was
  manually written into `localStorage` as `village_admin_session` (as if
  the frontend guard were somehow bypassed) — `ProtectedRoute` still
  bounces to `/login` because it checks `session.role !== 'ADMIN'`, and
  independently, calling `POST /announcements` directly with that resident
  token gets `403` from the backend's `RolesGuard`, confirming the backend
  is the actual authority and does not trust the frontend at all.
- Admin (`0800000000`) logs in successfully and lands on the dashboard.

### 7. Go/No-Go — Admin Dashboard addition to the MVP

**GO.** No blocking issues found. Build, lint, all 44 unit + 60 e2e tests
(including 29 new tests written this pass) pass. The one real bug found
(target-house preload causing silent data loss on announcement edit) is
fixed, verified by both an automated regression test and a live browser
run. The specific security concern flagged (OTP dev-bypass in production)
was verified NOT to be exploitable, at both unit and real-HTTP level, no
code change needed. RBAC/RLS/validation on the two new backend surfaces
(House module, announcement PATCH/DELETE) hold up under the same
adversarial testing standard as QA pass 1's findings for the original
modules.

Nothing new to add to QA pass 1's production-readiness punch list
(FCM/SMS wiring, OTP store → Redis, Finding A's RLS wording, sensitive-photo
`photo_url` nulling) — this pass's scope (Admin Dashboard UI + its two new
backend surfaces) did not touch any of those areas and found no additional
items of that severity.
