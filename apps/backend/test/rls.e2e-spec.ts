/**
 * Epic 0 backlog item: "Integration test: ยืนยันว่า query ข้าม tenant คืนค่าว่างเสมอ
 * แม้ application layer มีบั๊ก (กันรั่วระดับ DB)".
 *
 * TODO(Dev agent): implement against a real test Postgres instance
 * (docker-compose db, or a dedicated test container):
 *  1. Seed two villages (A, B), each with a house + a visitor_pass row.
 *  2. Using PrismaService directly (bypassing getTenantPrismaClient() on
 *     purpose — this test exists specifically to prove the DB-level
 *     guarantee holds even when application code "forgets" to scope a
 *     query), open a transaction, `SET LOCAL app.current_village_id` to
 *     village A's id, then run a query with NO `WHERE village_id = ...`
 *     clause against `visitor_passes` (or any RLS-protected table) and
 *     assert only village A's rows come back.
 *  3. Repeat with app.current_village_id unset entirely and assert ZERO
 *     rows come back (the policy's default-deny behavior — see
 *     apps/backend/prisma/sql/rls-policies.sql).
 *  4. This test only proves anything once
 *     apps/backend/prisma/sql/rls-policies.sql has actually been applied as
 *     a migration AND the app's DATABASE_URL connects as the non-superuser
 *     `village_app` role (see infra/postgres/init/01-init.sql) — if either
 *     is missing this test will pass for the wrong reason (superuser
 *     connections bypass RLS regardless of policy correctness).
 */
describe.skip('Row-Level Security (cross-tenant isolation)', () => {
  it('TODO: implement per the plan above', () => {
    expect(true).toBe(true);
  });
});
