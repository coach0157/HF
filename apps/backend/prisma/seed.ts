/**
 * Epic 0 backlog item: "Migration + seed script (sample village, admin user,
 * sample house)". Run with `npm run prisma:seed` (also invoked automatically
 * by `prisma migrate reset`).
 *
 * Note the pattern here mirrors RlsInterceptor (src/common/rls/rls.interceptor.ts):
 * this script runs outside any HTTP request, so there is no
 * AsyncLocalStorage tenant context to piggyback on — it opens its own
 * transaction and sets `app.current_village_id` itself, for the same reason
 * (RLS's WITH CHECK policy requires it on every INSERT once the DB role is
 * NOSUPERUSER — see infra/postgres/init/01-init.sql and
 * apps/backend/prisma/sql/rls-policies.sql).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fixed name used as the idempotency marker below — every fresh village a
// resident/guard/admin dev-testing session needs is named exactly this, so
// re-running `npm run prisma:seed` (e.g. by following the README setup
// steps twice) reuses the existing one instead of creating a duplicate
// village with the same seed phone numbers. Duplicate villages sharing a
// phone number trigger the real (and correct) multi-village disambiguation
// flow in auth.service.ts — which is a legitimate product feature, but not
// something a repeated local `prisma:seed` run should accidentally exercise.
const SEED_VILLAGE_NAME = 'หมู่บ้านตัวอย่าง (Sample Village)';

async function main() {
  const existing = await prisma.village.findFirst({
    where: { name: SEED_VILLAGE_NAME },
  });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Seed village already exists (${existing.id}) — skipping.`);
    return;
  }

  const village = await prisma.$transaction(async (tx) => {
    const village = await tx.village.create({
      data: {
        name: SEED_VILLAGE_NAME,
        address: '99/1 Sample Road, Bangkok',
        subscriptionPlan: 'trial',
        status: 'ACTIVE',
      },
    });

    // RLS policies require app.current_village_id to be set before any
    // INSERT into a tenant-owned table (see rls-policies.sql WITH CHECK).
    await tx.$executeRaw`SELECT set_config('app.current_village_id', ${village.id}, true)`;

    const house = await tx.house.create({
      data: {
        villageId: village.id,
        houseNo: '99/1',
        zone: 'A',
      },
    });

    const admin = await tx.user.create({
      data: {
        villageId: village.id,
        name: 'Admin ตัวอย่าง',
        phone: '0800000000',
        role: 'ADMIN',
      },
    });

    await tx.house.update({
      where: { id: house.id },
      data: { ownerUserId: admin.id },
    });

    const residentHouse = await tx.house.create({
      data: {
        villageId: village.id,
        houseNo: '12/34',
        zone: 'A',
      },
    });

    const resident = await tx.user.create({
      data: {
        villageId: village.id,
        name: 'Resident One',
        phone: '0811111111',
        role: 'RESIDENT',
        houseId: residentHouse.id,
      },
    });

    await tx.house.update({
      where: { id: residentHouse.id },
      data: { ownerUserId: resident.id },
    });

    await tx.user.create({
      data: {
        villageId: village.id,
        name: 'Guard One',
        phone: '0822222222',
        role: 'GUARD',
      },
    });

    return village;
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded village ${village.id}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
