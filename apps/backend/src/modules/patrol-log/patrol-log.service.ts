import { Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { FileStorageService } from "../../common/storage/file-storage.service";
import { CreatePatrolLogDto } from "./dto/create-patrol-log.dto";

export interface ListPatrolLogsFilters {
  date?: string;
  page: number;
  pageSize: number;
}

/**
 * Epic 12 — Guard Patrol Log (user request, not in original spec — see
 * docs/PHASE2_BACKLOG.md §5). Deliberately no checkpoint/state-machine
 * concept: a patrol log is a free-form, timestamped photo a guard takes
 * anywhere on rounds, as evidence a pass actually happened. `createdAt`
 * (always set by the DB default) + `guardUserId` (always the recording
 * guard's own claims.userId) are the two fields that make it "evidence" —
 * everything else (note/GPS) is optional per the epic's AC.
 */
@Injectable()
export class PatrolLogService {
  constructor(private readonly fileStorage: FileStorageService) {}

  async create(dto: CreatePatrolLogDto, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();

    const photoUrl = await this.fileStorage.savePhoto(
      "patrol-logs",
      claims.villageId,
      dto.photoDataUrl,
    );

    return tx.patrolLog.create({
      data: {
        villageId: claims.villageId,
        guardUserId: claims.userId,
        photoUrl,
        note: dto.note,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  /**
   * ADMIN and every GUARD (not just the one who recorded it — spec AC:
   * "รปภ. (ทุกคน ไม่จำกัดแค่คนที่บันทึก) ดูประวัติย้อนหลังได้") may list.
   * RESIDENT never reaches here at all — the controller's `@Roles("ADMIN",
   * "GUARD")` rejects it with 403 before this method is ever called, same
   * as the other Phase 2 admin/guard-only modules (no in-service role
   * branching needed for this one, unlike entry-log's resident-scoped
   * `list()`).
   */
  async list(filters: ListPatrolLogsFilters) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const where: Prisma.PatrolLogWhereInput = {};

    if (filters.date) {
      const day = new Date(filters.date);
      if (!Number.isNaN(day.getTime())) {
        const start = new Date(day);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.createdAt = { gte: start, lt: end };
      }
    }

    const [items, total] = await Promise.all([
      tx.patrolLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      tx.patrolLog.count({ where }),
    ]);

    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }
}
