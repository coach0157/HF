import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getTenantClaims, getTenantPrismaClient } from '../rls/tenant-context';

export interface AuditLogInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Epic 0 gap (per docs/ARCHITECTURE.md §5): "Audit log for admin access to
 * sensitive data" — spec 3.4 requires it, `AuditLog` Prisma model now exists
 * (see schema.prisma), this service is the single write path for it.
 *
 * `audit_logs` is append-only by design (spec ER comment) — this service
 * intentionally exposes only `log()`, never update/delete.
 *
 * Writes go through `getTenantPrismaClient()` like any other tenant write,
 * so they run inside the same RLS-scoped request transaction and get
 * `village_id` filtering/`WITH CHECK` for free. `actorUserId` is always the
 * currently authenticated user (from tenant claims) — this service is not
 * meant to log on behalf of another user.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async log(input: AuditLogInput): Promise<void> {
    const claims = getTenantClaims();
    if (!claims) {
      // Should never happen for endpoints that call this (they all require
      // an authenticated admin), but fail safe rather than throw and break
      // the request the audit log was supposed to observe.
      this.logger.warn(
        `AuditService.log() called with no tenant claims in context (action=${input.action}, resourceType=${input.resourceType}) — skipped`,
      );
      return;
    }

    const prisma = getTenantPrismaClient<PrismaClient>();
    await prisma.auditLog.create({
      data: {
        villageId: claims.villageId,
        actorUserId: claims.userId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }
}
