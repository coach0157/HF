import { Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  PrismaClient,
  TransportProviderType,
  UserRole,
} from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { CreateTransportProviderDto } from "./dto/create-transport-provider.dto";
import { UpdateTransportProviderDto } from "./dto/update-transport-provider.dto";

export interface TransportProviderListFilters {
  /** Raw `?active=` query string value ("true"/"false"); only honored for ADMIN callers. */
  active?: string;
  type?: TransportProviderType;
}

/**
 * Epic 10 — Transport Directory (spec 2.7 / PHASE2_BACKLOG.md Epic 10).
 * Deliberately the simplest module in the app: flat CRUD, no state machine,
 * no real-time — see schema.prisma's TransportProvider model doc comment.
 */
@Injectable()
export class TransportProviderService {
  async create(dto: CreateTransportProviderDto, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.transportProvider.create({
      data: {
        villageId: claims.villageId,
        name: dto.name,
        type: dto.type,
        phone: dto.phone,
        serviceArea: dto.serviceArea,
      },
    });
  }

  /**
   * ADMIN sees everything (including inactive), and may additionally narrow
   * with `?active=`. Every other role is hard-restricted to
   * `isActive: true` server-side regardless of what query params they send
   * — spec 2.7: "ลูกบ้านดูรายการที่เปิดใช้งาน (active) ได้" is an
   * authorization rule, not just a client-side convenience filter, so it's
   * enforced here rather than trusted from the caller's query string.
   */
  async list(claims: TenantClaims, filters: TransportProviderListFilters) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const isAdmin = claims.role === UserRole.ADMIN;

    const where: Prisma.TransportProviderWhereInput = {};
    if (!isAdmin) {
      where.isActive = true;
    } else if (filters.active !== undefined) {
      where.isActive = filters.active === "true";
    }
    if (filters.type) {
      where.type = filters.type;
    }

    return tx.transportProvider.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  async update(id: string, dto: UpdateTransportProviderDto) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const existing = await tx.transportProvider.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Transport provider not found");
    }

    return tx.transportProvider.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        phone: dto.phone,
        serviceArea: dto.serviceArea,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const tx = getTenantPrismaClient<PrismaClient>();
    const existing = await tx.transportProvider.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Transport provider not found");
    }
    await tx.transportProvider.delete({ where: { id } });
  }
}
