import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Announcement,
  AnnouncementLevel,
  AnnouncementTargetScope,
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { PushNotificationService } from "../../common/push/push-notification.service";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";

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
  constructor(
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async create(dto: CreateAnnouncementDto, claims: TenantClaims) {
    if (dto.targetScope === AnnouncementTargetScope.ZONE && !dto.targetZone) {
      throw new BadRequestException(
        "targetZone is required when targetScope is ZONE",
      );
    }
    if (
      dto.targetScope === AnnouncementTargetScope.HOUSE &&
      (!dto.targetHouseIds || dto.targetHouseIds.length === 0)
    ) {
      throw new BadRequestException(
        "targetHouseIds is required when targetScope is HOUSE",
      );
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
        targetZone:
          dto.targetScope === AnnouncementTargetScope.ZONE
            ? dto.targetZone
            : null,
        imageUrl: dto.imageUrl,
      },
    });

    if (
      dto.targetScope === AnnouncementTargetScope.HOUSE &&
      dto.targetHouseIds
    ) {
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

    // Epic 11 (ADR-006): push to every resolved recipient, for EVERY level
    // (PHASE2_BACKLOG.md Epic 11 AC #3: "ประกาศระดับฉุกเฉิน (และระดับอื่น
    // ด้วย)" — not emergency-only). ADR-006's `data` payload schema is
    // exactly `{type, id}` (no room for a `level` field), so the level is
    // instead surfaced as a title prefix (a best-effort hint for the
    // notification banner itself) — the tapped-through
    // AnnouncementDetailScreen re-fetches the announcement, which carries
    // the real `level`, to pick the actual color/sound treatment. Fire-and-
    // forget, not awaited, per ADR-006. SMS fallback for EMERGENCY level
    // remains a SEPARATE, still-unaddressed gap (no SMS gateway configured
    // in this MVP/dev environment; explicitly out of scope for Epic 11 per
    // the user's request — push only).
    const levelPrefix =
      announcement.level === AnnouncementLevel.EMERGENCY
        ? "🚨 [ฉุกเฉิน] "
        : announcement.level === AnnouncementLevel.IMPORTANT
          ? "⚠️ [สำคัญ] "
          : "";
    this.pushNotificationService.send(recipientUserIds, {
      title: `${levelPrefix}${announcement.title}`,
      body:
        announcement.content.length > 160
          ? `${announcement.content.slice(0, 160)}…`
          : announcement.content,
      data: { type: "announcement", id: announcement.id },
    });

    return { announcement, recipientUserIds };
  }

  /** Resolves the destination resident user list for an announcement's target_scope. */
  async resolveRecipients(announcement: Announcement): Promise<string[]> {
    const tx = getTenantPrismaClient<PrismaClient>();

    if (announcement.targetScope === AnnouncementTargetScope.ALL) {
      const users = await tx.user.findMany({
        where: { role: UserRole.RESIDENT },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    if (announcement.targetScope === AnnouncementTargetScope.ZONE) {
      if (!announcement.targetZone) return [];
      const houses = await tx.house.findMany({
        where: { zone: announcement.targetZone },
        select: { id: true },
      });
      const users = await tx.user.findMany({
        where: {
          role: UserRole.RESIDENT,
          houseId: { in: houses.map((h) => h.id) },
        },
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
      where: {
        role: UserRole.RESIDENT,
        houseId: { in: targets.map((t) => t.houseId) },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * Feed filtered to the CALLING user's house/zone against each
   * announcement's target_scope (spec 2.2 / entry-log.module.ts-style TODO
   * on announcement.module.ts). Admins see everything (authoring/oversight).
   *
   * QA fix: both branches now `include: { targets }` and flatten to a
   * `targetHouseIds: string[]` field on each returned announcement. Without
   * this, the Admin Dashboard's edit form (AnnouncementsPage.tsx's
   * startEdit()) had no way to preload which houses a HOUSE-scope
   * announcement already targeted — every edit forced the admin to
   * re-select houses from an all-unchecked list, and update()'s
   * "replace wholesale when targetHouseIds is supplied" behavior meant an
   * incomplete re-selection silently dropped previously-targeted houses
   * (silent data loss). See docs/QA_REPORT.md.
   */
  async list(claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();

    if (claims.role === UserRole.ADMIN) {
      const rows = await tx.announcement.findMany({
        orderBy: { createdAt: "desc" },
        include: { targets: { select: { houseId: true } } },
      });
      return rows.map((a) => this.flattenTargetHouseIds(a));
    }

    let zone: string | null = null;
    if (claims.houseId) {
      const house = await tx.house.findUnique({
        where: { id: claims.houseId },
      });
      zone = house?.zone ?? null;
    }

    const or: Prisma.AnnouncementWhereInput[] = [
      { targetScope: AnnouncementTargetScope.ALL },
    ];
    if (zone) {
      or.push({ targetScope: AnnouncementTargetScope.ZONE, targetZone: zone });
    }
    if (claims.houseId) {
      or.push({
        targetScope: AnnouncementTargetScope.HOUSE,
        targets: { some: { houseId: claims.houseId } },
      });
    }

    const rows = await tx.announcement.findMany({
      where: { OR: or },
      orderBy: { createdAt: "desc" },
      include: {
        reads: { where: { userId: claims.userId } },
        targets: { select: { houseId: true } },
      },
    });
    return rows.map((a) => this.flattenTargetHouseIds(a));
  }

  private flattenTargetHouseIds<T extends { targets?: { houseId: string }[] }>(
    a: T,
  ): Omit<T, "targets"> & { targetHouseIds: string[] } {
    const { targets, ...rest } = a;
    return { ...rest, targetHouseIds: (targets ?? []).map((t) => t.houseId) };
  }

  /**
   * Idempotent read receipt via upsert on the existing
   * `@@unique([announcementId, userId])` — no insert-then-check race.
   */
  async markRead(announcementId: string, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const announcement = await tx.announcement.findUnique({
      where: { id: announcementId },
    });
    if (!announcement) {
      throw new NotFoundException("Announcement not found");
    }

    return tx.announcementRead.upsert({
      where: {
        announcementId_userId: { announcementId, userId: claims.userId },
      },
      update: {},
      create: {
        villageId: claims.villageId,
        announcementId,
        userId: claims.userId,
      },
    });
  }

  /**
   * Dev-agent addition (see announcement.controller.ts's PATCH doc comment).
   * Re-validates targetScope/targetZone/targetHouseIds the same way create()
   * does when those fields are part of the update, and replaces the
   * AnnouncementTarget rows wholesale when targetHouseIds is supplied
   * (simpler and safer than a diff for MVP's low write-volume).
   */
  async update(id: string, dto: UpdateAnnouncementDto, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const existing = await tx.announcement.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Announcement not found");
    }

    const nextScope = dto.targetScope ?? existing.targetScope;
    if (nextScope === AnnouncementTargetScope.ZONE) {
      const zone = dto.targetZone ?? existing.targetZone;
      if (!zone) {
        throw new BadRequestException(
          "targetZone is required when targetScope is ZONE",
        );
      }
    }
    if (
      nextScope === AnnouncementTargetScope.HOUSE &&
      !dto.targetHouseIds &&
      dto.targetScope // only require it when the caller is switching TO house scope
    ) {
      throw new BadRequestException(
        "targetHouseIds is required when targetScope is HOUSE",
      );
    }

    const announcement = await tx.announcement.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        level: dto.level,
        targetScope: dto.targetScope,
        targetZone:
          dto.targetScope === undefined
            ? undefined
            : dto.targetScope === AnnouncementTargetScope.ZONE
              ? (dto.targetZone ?? existing.targetZone)
              : null,
        imageUrl: dto.imageUrl,
      },
    });

    if (dto.targetHouseIds) {
      await tx.announcementTarget.deleteMany({
        where: { announcementId: id },
      });
      await tx.announcementTarget.createMany({
        data: dto.targetHouseIds.map((houseId) => ({
          villageId: claims.villageId,
          announcementId: id,
          houseId,
        })),
        skipDuplicates: true,
      });
    }

    return announcement;
  }

  /** Cascades to announcement_reads/announcement_targets via FK onDelete. */
  async remove(id: string): Promise<void> {
    const tx = getTenantPrismaClient<PrismaClient>();
    const existing = await tx.announcement.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Announcement not found");
    }
    await tx.announcement.delete({ where: { id } });
  }
}
