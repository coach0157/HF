import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, VisitorPass, VisitorPassStatus } from '@prisma/client';
import { getTenantPrismaClient } from '../../common/rls/tenant-context';
import type { TenantClaims } from '../../common/rls/tenant-context';
import { AuditService } from '../../common/audit/audit.service';
import { QrTokenService } from './qr-token.service';
import { CreateVisitorPassDto } from './dto/create-visitor-pass.dto';

/**
 * Epic 2 — Visitor QR. Owns the `visitor_passes` state machine
 * (spec 2.1: `unused -> entered -> exited`, plus `expired`/`revoked`).
 * EntryLogModule calls `resolveForScan()` / `markEntered()` / `markExited()`
 * on this service rather than touching `visitor_passes` directly, per
 * ARCHITECTURE.md's module boundary table ("entry-log depends on
 * visitor-pass for pass status transitions").
 */
@Injectable()
export class VisitorPassService {
  constructor(
    private readonly qrToken: QrTokenService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateVisitorPassDto, claims: TenantClaims): Promise<VisitorPass> {
    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);

    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
      throw new BadRequestException('validFrom/validTo must be valid ISO date-times');
    }
    if (validFrom >= validTo) {
      throw new BadRequestException('validFrom must be before validTo');
    }
    if (validTo.getTime() <= Date.now()) {
      throw new BadRequestException('validTo must be in the future');
    }

    // Client-generated id so the QR JWT payload (which must embed pass_id)
    // can be signed BEFORE the row exists — avoids a placeholder-then-update
    // race on the unique `qr_token` column.
    const passId = randomUUID();
    const qrTokenValue = this.qrToken.sign(
      { passId, villageId: claims.villageId, usageType: dto.usageType },
      validTo,
    );

    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.visitorPass.create({
      data: {
        id: passId,
        villageId: claims.villageId,
        createdByUserId: claims.userId,
        visitorName: dto.visitorName,
        visitorPhone: dto.visitorPhone,
        vehiclePlate: dto.vehiclePlate,
        qrToken: qrTokenValue,
        validFrom,
        validTo,
        usageType: dto.usageType,
      },
    });
  }

  async revoke(id: string, claims: TenantClaims): Promise<VisitorPass> {
    const tx = getTenantPrismaClient<PrismaClient>();
    const pass = await tx.visitorPass.findUnique({ where: { id } });
    if (!pass) {
      throw new NotFoundException('Visitor pass not found');
    }

    const isOwner = pass.createdByUserId === claims.userId;
    const isAdmin = claims.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You can only revoke your own visitor passes');
    }

    if (pass.status === VisitorPassStatus.REVOKED) {
      return pass; // idempotent
    }
    if (pass.status === VisitorPassStatus.EXITED || pass.status === VisitorPassStatus.EXPIRED) {
      throw new BadRequestException(`Cannot revoke a pass with status ${pass.status}`);
    }

    const updated = await tx.visitorPass.update({
      where: { id },
      data: { status: VisitorPassStatus.REVOKED },
    });

    // Spec 3.4 audit-trail requirement (a): an admin revoking someone ELSE's
    // pass is a sensitive-data access that must be logged. A resident
    // revoking their own pass, or an admin revoking their own, is routine
    // and not logged (keeps the audit log signal-to-noise usable).
    if (isAdmin && !isOwner) {
      await this.auditService.log({
        action: 'REVOKE_VISITOR_PASS_OTHER_USER',
        resourceType: 'visitor_pass',
        resourceId: id,
        metadata: { ownerUserId: pass.createdByUserId, visitorName: pass.visitorName },
      });
    }

    return updated;
  }

  /**
   * Verifies signature + expiry + status/time-window for a scanned QR, and
   * lazily flips a stale UNUSED/ENTERED pass to EXPIRED if `validTo` has
   * passed (so the state is correct for the very next read even if no cron
   * runs). Used both by the guard-facing `GET /visitor-passes/:token`
   * endpoint and internally by EntryLogModule.
   */
  async resolveForScan(token: string, claims: TenantClaims): Promise<VisitorPass> {
    let payload: { passId: string; villageId: string };
    try {
      payload = this.qrToken.verify(token);
    } catch {
      throw new ForbiddenException('QR code is invalid or expired');
    }

    if (payload.villageId !== claims.villageId) {
      // Cross-village QR — RLS would return nothing for the lookup below
      // anyway, but fail fast with a clear signal instead of a generic 404.
      throw new NotFoundException('Visitor pass not found');
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    let pass = await tx.visitorPass.findUnique({ where: { id: payload.passId } });
    if (!pass || pass.qrToken !== token) {
      throw new NotFoundException('Visitor pass not found');
    }

    if (pass.status === VisitorPassStatus.REVOKED) {
      throw new ForbiddenException('This QR code has been revoked');
    }

    const now = new Date();
    if (now > pass.validTo && pass.status !== VisitorPassStatus.EXPIRED && pass.status !== VisitorPassStatus.EXITED) {
      pass = await tx.visitorPass.update({
        where: { id: pass.id },
        data: { status: VisitorPassStatus.EXPIRED },
      });
    }
    if (pass.status === VisitorPassStatus.EXPIRED) {
      throw new ForbiddenException('This QR code has expired');
    }
    if (now < pass.validFrom) {
      throw new ForbiddenException('This QR code is not valid yet');
    }

    return pass;
  }

  /**
   * Guard scan-screen payload (spec 1.2: "แสดงข้อมูลแขก/รถ"): the pass
   * itself plus who invited them (host name + house no/zone), resolved via
   * the pass's `created_by_user_id` since `visitor_passes` has no direct
   * `house_id` column (see schema.prisma — the invited house is implied by
   * which resident created the pass).
   */
  async scanDetails(token: string, claims: TenantClaims) {
    const pass = await this.resolveForScan(token, claims);
    const tx = getTenantPrismaClient<PrismaClient>();
    const host = await tx.user.findUnique({
      where: { id: pass.createdByUserId },
      include: { house: true },
    });

    return {
      pass,
      host: host
        ? { id: host.id, name: host.name, phone: host.phone, houseNo: host.house?.houseNo ?? null, zone: host.house?.zone ?? null }
        : null,
    };
  }

  /**
   * Transitions a pass into ENTERED. Rules per spec 2.1's state machine:
   *  - UNUSED -> ENTERED: normal first entry.
   *  - EXITED -> ENTERED: only allowed for MULTI-use passes (re-entry on a
   *    later visit); SINGLE-use passes that already completed one
   *    entry/exit cycle are done.
   *  - ENTERED -> (no-op, throws): this is the "guard re-scans at the exit
   *    gate" case — the caller (EntryLogModule) must detect this BEFORE
   *    calling markEntered() and route to the existing open entry log +
   *    confirm-exit flow instead, per spec 2.1's "no auto-close" rule.
   */
  async markEntered(passId: string): Promise<VisitorPass> {
    const tx = getTenantPrismaClient<PrismaClient>();
    const pass = await tx.visitorPass.findUniqueOrThrow({ where: { id: passId } });

    if (pass.status === VisitorPassStatus.UNUSED) {
      return tx.visitorPass.update({ where: { id: passId }, data: { status: VisitorPassStatus.ENTERED } });
    }
    if (pass.status === VisitorPassStatus.EXITED && pass.usageType === 'MULTI') {
      return tx.visitorPass.update({ where: { id: passId }, data: { status: VisitorPassStatus.ENTERED } });
    }
    if (pass.status === VisitorPassStatus.EXITED) {
      throw new BadRequestException('This single-use pass has already been used');
    }
    throw new BadRequestException(`Cannot mark pass as entered from status ${pass.status}`);
  }

  /** Transitions a pass ENTERED -> EXITED. Called only from confirm-exit. */
  async markExited(passId: string): Promise<VisitorPass> {
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.visitorPass.update({
      where: { id: passId },
      data: { status: VisitorPassStatus.EXITED },
    });
  }

  async findById(id: string): Promise<VisitorPass | null> {
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.visitorPass.findUnique({ where: { id } });
  }

  /**
   * Stub for the future offline Guard app sync list (spec 3.4 "Offline scan
   * กับ revocation" — no UI this round, just the endpoint shape per backlog
   * Epic 2). NOTE: VisitorPass has no `updated_at` column in the current
   * schema, so `since` filters on `created_at` as an approximation — a pass
   * revoked long after creation still shows up correctly (it's revoked NOW,
   * still in the result set), but a guard app polling incrementally by
   * "created after last sync" could miss an old pass that was JUST revoked.
   * Flagged as a known limitation rather than silently wrong; fix properly
   * (add `updated_at`) when the real offline Guard app is built.
   */
  async listRevokedSince(since?: string) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const where: Prisma.VisitorPassWhereInput = {
      status: { in: [VisitorPassStatus.REVOKED, VisitorPassStatus.EXPIRED] },
    };
    if (since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        where.createdAt = { gte: sinceDate };
      }
    }
    return tx.visitorPass.findMany({
      where,
      select: { id: true, qrToken: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
