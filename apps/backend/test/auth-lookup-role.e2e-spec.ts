/**
 * Highest-risk item flagged for this QA pass: `village_app_auth_lookup` is a
 * deliberately-BYPASSRLS Postgres role (see
 * apps/backend/prisma/migrations/20260828080000_grant_auth_lookup_role/ and
 * infra/postgres/init/01-init.sql), used ONLY by
 * apps/backend/src/modules/auth/auth.service.ts's login() to resolve which
 * village(s) a phone number belongs to before village_id is known.
 *
 * BYPASSRLS means Postgres RLS policies do not apply to this role's
 * sessions AT ALL, on ANY table — so the entire safety story for this role
 * rests on standard SQL column/table GRANTs, not RLS. This suite connects as
 * that exact role (AUTH_LOOKUP_DATABASE_URL) and proves the blast radius is
 * exactly what the migration's comment claims: SELECT on 6 named columns of
 * `users`, nothing else, no writes, no other table.
 */
import { PrismaClient } from '@prisma/client';
import {
  rawPrisma,
  createVillageFixture,
  deleteVillage,
  VillageFixture,
} from './support/test-helpers';

describe('village_app_auth_lookup role — blast-radius verification', () => {
  let villageA: VillageFixture;
  let villageB: VillageFixture;
  let authLookupPrisma: PrismaClient;

  beforeAll(async () => {
    villageA = await createVillageFixture('AuthLookup-A', '71');
    villageB = await createVillageFixture('AuthLookup-B', '72');
    authLookupPrisma = new PrismaClient({ datasourceUrl: process.env.AUTH_LOOKUP_DATABASE_URL });
  }, 30_000);

  afterAll(async () => {
    await authLookupPrisma.$disconnect();
    await deleteVillage(villageA.villageId);
    await deleteVillage(villageB.villageId);
    await rawPrisma.$disconnect();
  });

  it('CAN read the exact granted columns across villages — this cross-tenant read is the intended purpose', async () => {
    const rows = await authLookupPrisma.user.findMany({
      where: { id: { in: [villageA.resident.id, villageB.resident.id] } },
      select: { id: true, villageId: true, phone: true, role: true, houseId: true, name: true },
    });
    expect(rows).toHaveLength(2);
    const villageIds = rows.map((r) => r.villageId).sort();
    expect(villageIds).toEqual([villageA.villageId, villageB.villageId].sort());
  });

  it('CANNOT read password_hash', async () => {
    await expect(
      authLookupPrisma.user.findMany({ select: { id: true, passwordHash: true } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT read line_user_id (or any other non-granted column)', async () => {
    await expect(
      authLookupPrisma.user.findMany({ select: { id: true, lineUserId: true } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT do an implicit SELECT * (Prisma\'s default findMany() with no select)', async () => {
    await expect(authLookupPrisma.user.findMany()).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT read visitor_passes (no grant on this or any other table)', async () => {
    await expect(authLookupPrisma.visitorPass.findMany()).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT read audit_logs', async () => {
    await expect(authLookupPrisma.auditLog.findMany()).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT read houses', async () => {
    await expect(authLookupPrisma.house.findMany()).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT read entry_logs', async () => {
    await expect(authLookupPrisma.entryLog.findMany()).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT write — UPDATE is rejected even on the users table it can read from', async () => {
    await expect(
      authLookupPrisma.user.updateMany({ where: { id: villageA.resident.id }, data: { name: 'hacked' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT write — DELETE is rejected even on the users table it can read from', async () => {
    await expect(
      authLookupPrisma.user.deleteMany({ where: { id: villageA.resident.id } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('CANNOT write — INSERT is rejected', async () => {
    await expect(
      authLookupPrisma.$executeRaw`INSERT INTO users (id, village_id, name, phone, role) VALUES (gen_random_uuid(), ${villageA.villageId}::uuid, 'x', '0899999999', 'resident')`,
    ).rejects.toThrow(/permission denied/i);
  });

  it('sanity cross-check: village_app (the normal RLS-scoped role) never returns real data with no tenant context set, unlike this bypass role', async () => {
    // See docs/QA_REPORT.md / test/rls.e2e-spec.ts for why this asserts
    // "zero rows OR a DB error" rather than strictly zero rows: on a
    // previously-used pooled connection, Postgres's custom-GUC placeholder
    // behavior makes an unset current_setting() come back as '' (not NULL),
    // and ''::uuid raises rather than evaluating to NULL — still fail-closed
    // (no row ever returned), just not always a silent empty array.
    let rows: unknown[] | undefined;
    let threw = false;
    try {
      rows = await rawPrisma.$transaction(async (tx) => tx.user.findMany());
    } catch {
      threw = true;
    }
    expect(threw || (rows && rows.length === 0)).toBe(true);
  });
});
