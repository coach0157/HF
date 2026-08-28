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

async function main() {
  const village = await prisma.$transaction(async (tx) => {
    const village = await tx.village.create({
      data: {
        name: 'หมู่บ้านตัวอย่าง (Sample Village)',
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
