import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Announcement, AnnouncementTargetScope, Prisma, PrismaClient, UserRole } from '@prisma/client';
import { getTenantPrismaClient } from '../../common/rls/tenant-context';
import type { TenantClaims } from '../../common/rls/tenant-context';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

/**
 * Epic 3 — Announcement. See MVP_BACKLOG.md Epic 3 and spec 2.2/3.3.
 *
 * Schema addition beyond spec 3.2's literal ER (see schema.prisma comments
 * on `Announcement.targetZone` / `AnnouncementTarget`): target_scope=ZONE
 * resolves via a plain `targetZone` string column (zone is already a simple
 * string on `houses.zone`); target_scope=HOUSE resolves via the
 * `AnnouncementTarget` join table (supports multiple specific houses).
 */
@Injectable()
export class AnnouncementService {
  async create(dto: CreateAnnouncementDto, claims: TenantClaims) {
    if (dto.targetScope === AnnouncementTargetScope.ZONE && !dto.targetZone) {
      throw new BadRequestException('targetZone is required when targetScope is ZONE');
    }
    if (
      dto.targetScope === AnnouncementTargetScope.HOUSE &&
      (!dto.targetHouseIds || dto.targetHouseIds.length === 0)
    ) {
      throw new BadRequestException('targetHouseIds is required when targetScope is HOUSE');
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    const announcement = await tx.announcement.create({
      data: {
        villageId: claims.villageId,
        createdByAdminId: claims.userId,
        title: dto.title,
        content: dto.content,
        level: dto.level,
        targetScope: dto.targetScope,
        targetZone: dto.targetScope === AnnouncementTargetScope.ZONE ? dto.targetZone : null,
        imageUrl: dto.imageUrl,
      },
    });

    if (dto.targetScope === AnnouncementTargetScope.HOUSE && dto.targetHouseIds) {
      await tx.announcementTarget.createMany({
        data: dto.targetHouseIds.map((houseId) => ({
          villageId: claims.villageId,
          announcementId: announcement.id,
          houseId,
        })),
        skipDuplicates: true,
      });
    }

    const recipientUserIds = await this.resolveRecipients(announcement);

    // Spec 2.2: EMERGENCY level -> push + SMS fallback; every level carries
    // `level` in push metadata so the client can pick color/sound.
    // TODO(Dev agent, future): actual push/SMS provider wiring — no FCM
    // credentials or SMS gateway configured in this MVP/dev environment
    // (.env.example only stubs OTP's SMS path, not a general SMS provider).
    // Documented gap. Recipient targeting (WHO gets it) is fully implemented
    // and returned here so it's independently verifiable/testable.

    return { announcement, recipientUserIds };
  }

  /** Resolves the destination resident user list for an announcement's target_scope. */
  async resolveRecipients(announcement: Announcement): Promise<string[]> {
    const tx = getTenantPrismaClient<PrismaClient>();

    if (announcement.targetScope === AnnouncementTargetScope.ALL) {
      const users = await tx.user.findMany({ where: { role: UserRole.RESIDENT }, select: { id: true } });
      return users.map((u) => u.id);
    }

    if (announcement.targetScope === AnnouncementTargetScope.ZONE) {
      if (!announcement.targetZone) return [];
      const houses = await tx.house.findMany({ where: { zone: announcement.targetZone }, select: { id: true } });
      const users = await tx.user.findMany({
        where: { role: UserRole.RESIDENT, houseId: { in: houses.map((h) => h.id) } },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    // HOUSE
    const targets = await tx.announcementTarget.findMany({
      where: { announcementId: announcement.id },
      select: { houseId: true },
    });
    const users = await tx.user.findMany({
      where: { role: UserRole.RESIDENT, houseId: { in: targets.map((t) => t.houseId) } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * Feed filtered to the CALLING user's house/zone against each
   * announcement's target_scope (spec 2.2 / entry-log.module.ts-style TODO
   * on announcement.module.ts). Admins see everything (authoring/oversight).
   */
  async list(claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();

    if (claims.role === UserRole.ADMIN) {
      return tx.announcement.findMany({ orderBy: { createdAt: 'desc' } });
    }

    let zone: string | null = null;
    if (claims.houseId) {
      const house = await tx.house.findUnique({ where: { id: claims.houseId } });
      zone = house?.zone ?? null;
    }

    const or: Prisma.AnnouncementWhereInput[] = [{ targetScope: AnnouncementTargetScope.ALL }];
    if (zone) {
      or.push({ targetScope: AnnouncementTargetScope.ZONE, targetZone: zone });
    }
    if (claims.houseId) {
      or.push({ targetScope: AnnouncementTargetScope.HOUSE, targets: { some: { houseId: claims.houseId } } });
    }

    return tx.announcement.findMany({
      where: { OR: or },
      orderBy: { createdAt: 'desc' },
      include: { reads: { where: { userId: claims.userId } } },
    });
  }

  /**
   * Idempotent read receipt via upsert on the existing
   * `@@unique([announcementId, userId])` — no insert-then-check race.
   */
  async markRead(announcementId: string, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const announcement = await tx.announcement.findUnique({ where: { id: announcementId } });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    return tx.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId: claims.userId } },
      update: {},
      create: { villageId: claims.villageId, announcementId, userId: claims.userId },
    });
  }
}
