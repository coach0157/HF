import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper around the generated Prisma client. This is the ONLY place
 * that should hold a long-lived Prisma connection pool for the app.
 *
 * Do NOT query through this service directly from module services for
 * tenant-owned tables — use `getTenantPrismaClient()` from
 * `src/common/rls/tenant-context.ts` instead, which returns the
 * transaction-scoped client that has RLS's `app.current_village_id`
 * already SET LOCAL for the current request (see RlsInterceptor).
 *
 * This service IS the right thing to inject directly for:
 *  - RlsInterceptor itself (it needs the base client to open transactions)
 *  - genuinely cross-tenant/system code (platform admin tooling, cron jobs)
 *  - the `villages` table, which has no village_id / no RLS policy
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
