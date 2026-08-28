/**
 * Epic 0 backlog item: "Integration test: ยืนยันว่า query ข้าม tenant คืนค่าว่างเสมอ
 * แม้ application layer มีบั๊ก (กันรั่วระดับ DB)".
 *
 * This is the DB-level proof (no NestJS app, no HTTP) that Postgres Row-Level
 * Security itself — not application code — is what prevents cross-tenant
 * leaks. Deliberately uses `rawPrisma` (connects as `village_app`, the same
 * non-superuser role the app uses) and issues queries with NO `where:
 * { villageId }` clause, exactly like the original TODO in this file
 * specified: "even when application code 'forgets' to scope a query".
 *
 * For the API-level equivalent (real HTTP calls, real JWTs, asserting the
 * app's actual endpoints reject cross-tenant access) see
 * test/security-flows.e2e-spec.ts. For the separate `village_app_auth_lookup`
 * BYPASSRLS role's blast radius, see test/auth-lookup-role.e2e-spec.ts.
 */
import {
  rawPrisma,
  withVillageContext,
  createVillageFixture,
  deleteVillage,
  VillageFixture,
  futureIso,
  pastIso,
} from './support/test-helpers';

describe('Row-Level Security (cross-tenant isolation, DB-level, no app code)', () => {
  let villageA: VillageFixture;
  let villageB: VillageFixture;

  beforeAll(async () => {
    villageA = await createVillageFixture('RLS-A', '81');
    villageB = await createVillageFixture('RLS-B', '82');

    // Seed one visitor_passes row per village too — the original TODO named
    // this table explicitly ("visitor_passes (or any RLS-protected table)").
    await withVillageContext(villageA.villageId, (tx) =>
      tx.visitorPass.create({
        data: {
          villageId: villageA.villageId,
          createdByUserId: villageA.resident.id,
          visitorName: 'RLS probe A',
          qrToken: `rls-probe-token-a-${villageA.villageId}`,
          validFrom: new Date(pastIso(60_000)),
          validTo: new Date(futureIso(3_600_000)),
          usageType: 'SINGLE',
        },
      }),
    );
    await withVillageContext(villageB.villageId, (tx) =>
      tx.visitorPass.create({
        data: {
          villageId: villageB.villageId,
          createdByUserId: villageB.resident.id,
          visitorName: 'RLS probe B',
          qrToken: `rls-probe-token-b-${villageB.villageId}`,
          validFrom: new Date(pastIso(60_000)),
          validTo: new Date(futureIso(3_600_000)),
          usageType: 'SINGLE',
        },
      }),
    );
  }, 30_000);

  afterAll(async () => {
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
  });

  it('houses: a query with NO village_id filter, scoped to village A, returns ONLY village A rows', async () => {
    const houses = await withVillageContext(villageA.villageId, (tx) => tx.house.findMany());
    expect(houses.length).toBeGreaterThan(0);
    expect(houses.every((h) => h.villageId === villageA.villageId)).toBe(true);
    expect(houses.some((h) => h.villageId === villageB.villageId)).toBe(false);
  });

  it('visitor_passes: a query with NO village_id filter, scoped to village B, returns ONLY village B rows', async () => {
    const passes = await withVillageContext(villageB.villageId, (tx) => tx.visitorPass.findMany());
    expect(passes.length).toBeGreaterThan(0);
    expect(passes.every((p) => p.villageId === villageB.villageId)).toBe(true);
    expect(passes.some((p) => p.villageId === villageA.villageId)).toBe(false);
  });

  it('users: likewise isolated per-village with no WHERE clause needed', async () => {
    const usersA = await withVillageContext(villageA.villageId, (tx) => tx.user.findMany());
    expect(usersA.length).toBeGreaterThan(0);
    expect(usersA.every((u) => u.villageId === villageA.villageId)).toBe(true);
  });

  /**
   * QA FINDING (see docs/QA_REPORT.md): ARCHITECTURE.md §3.1 documents
   * `current_setting('app.current_village_id', true)` as returning NULL
   * (-> zero rows, not an error) whenever the setting was never SET for the
   * current transaction. That is only true on a Postgres backend connection
   * that has NEVER once had this custom GUC set in its lifetime. Once ANY
   * transaction on a pooled connection has called `set_config('app.current_
   * village_id', ..., true)` (which happens on literally every real request
   * once RlsInterceptor runs), Postgres keeps a "placeholder" for that GUC
   * name for the rest of the connection's life — so a LATER transaction on
   * the SAME connection that forgets to set it gets `''` (empty string),
   * not NULL, from current_setting. `''::uuid` then raises a Postgres error
   * instead of evaluating the USING clause to NULL/false.
   *
   * This is NOT a cross-tenant leak (no row is ever returned either way —
   * an error is just as fail-closed as zero rows), but it IS a real gap
   * between the documented behavior and what a warmed-up connection pool
   * actually does. Asserted here as "no real data comes back", tolerating
   * either outcome, so this test is deterministic regardless of whether
   * Prisma happens to hand back a fresh or previously-used connection.
   */
  it('a query with app.current_village_id UNSET fails closed on every RLS table — either zero rows or a DB error, NEVER real data', async () => {
    for (const query of [
      () => rawPrisma.$transaction((tx) => tx.house.findMany()),
      () => rawPrisma.$transaction((tx) => tx.visitorPass.findMany()),
      () => rawPrisma.$transaction((tx) => tx.user.findMany()),
    ]) {
      let rows: unknown[] | undefined;
      let threw = false;
      try {
        rows = await query();
      } catch {
        threw = true;
      }
      expect(threw || (rows && rows.length === 0)).toBe(true);
    }
  });

  it('setting app.current_village_id to an unrelated/nonexistent uuid also returns ZERO rows (not an error, not all rows)', async () => {
    const bogusVillageId = '00000000-0000-0000-0000-000000000000';
    const houses = await withVillageContext(bogusVillageId, (tx) => tx.house.findMany());
    expect(houses).toEqual([]);
  });
});
