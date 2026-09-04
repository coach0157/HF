import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { CreateBlockedVisitorDto } from "./dto/create-blocked-visitor.dto";

/**
 * User-requested add-on (docs/PHASE2_BACKLOG.md §6 (Epic 13)): a village-wide ban list
 * an ADMIN maintains, checked by VisitorPassService (before a resident can
 * issue a QR) and EntryLogService (before a guard records a QR-scan or
 * manual entry) via assertNotBlocked() — see those files' call sites.
 * Deliberately flat (no update endpoint): editing an entry is delete +
 * re-add, matching how small this table's shape is.
 */
@Injectable()
export class BlockedVisitorService {
  async create(dto: CreateBlockedVisitorDto, claims: TenantClaims) {
    if (!dto.phone && !dto.vehiclePlate) {
      throw new BadRequestException(
        "At least one of phone or vehiclePlate is required",
      );
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.blockedVisitor.create({
      data: {
        villageId: claims.villageId,
        phone: dto.phone,
        vehiclePlate: dto.vehiclePlate,
        reason: dto.reason,
        createdByUserId: claims.userId,
      },
    });
  }

  async list() {
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.blockedVisitor.findMany({ orderBy: { createdAt: "desc" } });
  }

  async remove(id: string): Promise<void> {
    const tx = getTenantPrismaClient<PrismaClient>();
    const existing = await tx.blockedVisitor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Blocked visitor entry not found");
    }
    await tx.blockedVisitor.delete({ where: { id } });
  }

  /**
   * Called from visitor-pass.service.ts's create() and
   * entry-log.service.ts's createFromQr()/createManual() — throws 403 if
   * either the phone or the plate matches a village-wide block entry.
   * `undefined`/empty values never match (a blocklist row missing one field
   * only blocks on the other), matching how the row was created.
   */
  async assertNotBlocked(contact: {
    phone?: string | null;
    vehiclePlate?: string | null;
  }): Promise<void> {
    if (!contact.phone && !contact.vehiclePlate) return;

    const tx = getTenantPrismaClient<PrismaClient>();
    const where: Prisma.BlockedVisitorWhereInput = { OR: [] };
    if (contact.phone) {
      (where.OR as Prisma.BlockedVisitorWhereInput[]).push({
        phone: contact.phone,
      });
    }
    if (contact.vehiclePlate) {
      (where.OR as Prisma.BlockedVisitorWhereInput[]).push({
        vehiclePlate: contact.vehiclePlate,
      });
    }

    const match = await tx.blockedVisitor.findFirst({ where });
    if (match) {
      throw new ForbiddenException(
        match.reason
          ? `This visitor is on the village block list: ${match.reason}`
          : "This visitor is on the village block list",
      );
    }
  }
}
