import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  EntryMethod,
  ExitConfirmationMethod,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { AuditService } from "../../common/audit/audit.service";
import { FileStorageService } from "../../common/storage/file-storage.service";
import { VisitorPassService } from "../visitor-pass/visitor-pass.service";
import { CreateEntryLogDto } from "./dto/create-entry-log.dto";

export interface ListEntryLogsFilters {
  houseId?: string;
  date?: string;
  page: number;
  pageSize: number;
  /** `true` = only exited (`exit_time IS NOT NULL`), `false` = only still-open (`exit_time IS NULL`), undefined = no filter. */
  exited?: boolean;
}

/**
 * Epic 2 — Entry/Exit Log. See MVP_BACKLOG.md Epic 2 and spec 2.1/3.3/3.4.
 * The critical rule this whole module is built around: scanning a QR a
 * second time (at the exit gate) must NEVER by itself set `exit_time` — see
 * `create()`'s ENTERED-status branch and `confirmExit()`, the only method
 * that ever sets it.
 */
@Injectable()
export class EntryLogService {
  constructor(
    private readonly visitorPassService: VisitorPassService,
    private readonly fileStorage: FileStorageService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateEntryLogDto, claims: TenantClaims) {
    if (dto.qrToken) {
      return this.createFromQr(dto, claims);
    }
    return this.createManual(dto, claims);
  }

  private async createFromQr(dto: CreateEntryLogDto, claims: TenantClaims) {
    const pass = await this.visitorPassService.resolveForScan(
      dto.qrToken!,
      claims,
    );
    const tx = getTenantPrismaClient<PrismaClient>();

    if (pass.status === "ENTERED") {
      // This is the guard re-scanning at the EXIT gate (spec 2.1: "QR ใบเดียว
      // ใช้สแกนได้ทั้งตอนเข้าและตอนออก"). Do NOT create a duplicate entry_log
      // or touch exit_time here — return the existing open log so the guard
      // UI can present the explicit "ยืนยันแขกออก" confirm-exit action.
      const openLog = await tx.entryLog.findFirst({
        where: { passId: pass.id, exitTime: null },
        orderBy: { entryTime: "desc" },
      });
      if (openLog) {
        return { entryLog: openLog, alreadyEntered: true };
      }
      // Data inconsistency fallback (pass says ENTERED, no open log found) —
      // fall through and create a fresh entry rather than error the guard.
    }

    const host = await tx.user.findUnique({
      where: { id: pass.createdByUserId },
    });
    if (!host?.houseId) {
      throw new BadRequestException(
        "The resident who created this pass has no house assigned",
      );
    }

    const photoUrl = dto.photoDataUrl
      ? await this.fileStorage.savePhoto(
          "entry-logs",
          claims.villageId,
          dto.photoDataUrl,
        )
      : undefined;

    const entryLog = await tx.entryLog.create({
      data: {
        villageId: claims.villageId,
        passId: pass.id,
        houseId: host.houseId,
        recordedByGuardId: claims.userId,
        visitorName: pass.visitorName,
        vehiclePlate: pass.vehiclePlate,
        photoUrl,
        entryTime: new Date(),
        method: EntryMethod.QR,
      },
    });

    await this.visitorPassService.markEntered(pass.id);

    // TODO(Dev agent, future — Epic 11, docs/ARCHITECTURE.md ADR-006): Expo
    // push to `host` within ~3s of a successful scan-in (soft target, spec
    // 2.1), via the shared `PushNotificationService` (src/common/push/, not
    // yet implemented — Epic 11 is at the planning/schema stage; see
    // PHASE2_BACKLOG.md Epic 11). Not implemented here — documented gap
    // rather than a stub pretending to send. When wired, call it AFTER this
    // transaction resolves (RlsInterceptor's documented trade-off: don't
    // hold the request transaction open across a slow external call), and
    // fire-and-forget per ADR-006 (don't await it on this response path).

    return { entryLog, alreadyEntered: false };
  }

  private async createManual(dto: CreateEntryLogDto, claims: TenantClaims) {
    if (!dto.visitorName || !dto.houseId || !dto.photoDataUrl) {
      throw new BadRequestException(
        "Manual entry requires visitorName, houseId, and a photo of the ID card/plate (photoDataUrl)",
      );
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    const house = await tx.house.findUnique({ where: { id: dto.houseId } });
    if (!house) {
      throw new NotFoundException("House not found");
    }

    // No QR here, so the photo IS the ID-card/plate photo (spec 2.1: "ถ่ายรูป
    // บัตร ปชช./ทะเบียนรถ") — route to the higher-security sensitive bucket
    // (spec 3.4), not the general entry-logs bucket.
    const photoUrl = await this.fileStorage.savePhoto(
      "sensitive-id",
      claims.villageId,
      dto.photoDataUrl,
    );

    const entryLog = await tx.entryLog.create({
      data: {
        villageId: claims.villageId,
        houseId: dto.houseId,
        recordedByGuardId: claims.userId,
        visitorName: dto.visitorName,
        vehiclePlate: dto.vehiclePlate,
        photoUrl,
        entryTime: new Date(),
        method: EntryMethod.MANUAL,
      },
    });

    return { entryLog, alreadyEntered: false };
  }

  /**
   * The ONLY method that ever sets exit_time — spec 2.1's "no auto-close"
   * rule. Supports both confirmation paths: guard re-scan-and-confirm, and
   * resident push-and-confirm (must be the visited house's member).
   */
  async confirmExit(id: string, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const entryLog = await tx.entryLog.findUnique({ where: { id } });
    if (!entryLog) {
      throw new NotFoundException("Entry log not found");
    }
    if (entryLog.exitTime) {
      throw new BadRequestException(
        "This entry has already been confirmed as exited",
      );
    }

    let method: ExitConfirmationMethod;
    if (claims.role === "GUARD") {
      method = ExitConfirmationMethod.GUARD;
    } else if (claims.role === "RESIDENT") {
      if (claims.houseId !== entryLog.houseId) {
        throw new ForbiddenException(
          "You can only confirm exit for visitors to your own house",
        );
      }
      method = ExitConfirmationMethod.RESIDENT;
    } else {
      throw new ForbiddenException(
        "Only a guard or the visited resident can confirm exit",
      );
    }

    const updated = await tx.entryLog.update({
      where: { id },
      data: {
        exitTime: new Date(),
        exitConfirmedByUserId: claims.userId,
        exitConfirmationMethod: method,
      },
    });

    if (entryLog.passId) {
      await this.visitorPassService.markExited(entryLog.passId);
    }

    return updated;
  }

  async list(filters: ListEntryLogsFilters, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const where: Prisma.EntryLogWhereInput = {};

    if (claims.role === "RESIDENT") {
      // Residents may only ever see their own house's history (spec 1.1
      // "หน้าประวัติเข้า-ออก") — ignore/override any house_id they pass.
      if (!claims.houseId) {
        return {
          items: [],
          total: 0,
          page: filters.page,
          pageSize: filters.pageSize,
        };
      }
      where.houseId = claims.houseId;
    } else if (filters.houseId) {
      where.houseId = filters.houseId;
    }

    if (filters.date) {
      const day = new Date(filters.date);
      if (!Number.isNaN(day.getTime())) {
        const start = new Date(day);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.entryTime = { gte: start, lt: end };
      }
    }

    // QA-flagged gap (spec 2.1's dual-confirm flow): server-side "still
    // open" filter so callers like the Guard app's exit-confirm screen get
    // a correct result against the real total instead of paging through
    // pageSize-capped, client-side-filtered results that silently drop
    // open visitors past the page boundary.
    if (filters.exited === true) {
      where.exitTime = { not: null };
    } else if (filters.exited === false) {
      where.exitTime = null;
    }

    const [items, total] = await Promise.all([
      tx.entryLog.findMany({
        where,
        orderBy: { entryTime: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      tx.entryLog.count({ where }),
    ]);

    // Spec 3.4 audit-trail requirement (c): admin listing/exporting entry
    // logs (which carry photo_url — sensitive) must be logged.
    if (claims.role === "ADMIN") {
      await this.auditService.log({
        action: "LIST_ENTRY_LOGS",
        resourceType: "entry_log",
        metadata: {
          houseId: filters.houseId ?? null,
          date: filters.date ?? null,
          page: filters.page,
          pageSize: filters.pageSize,
          resultCount: items.length,
        },
      });
    }

    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }

  async findOne(id: string, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const entryLog = await tx.entryLog.findUnique({ where: { id } });
    if (!entryLog) {
      throw new NotFoundException("Entry log not found");
    }
    if (claims.role === "RESIDENT" && entryLog.houseId !== claims.houseId) {
      throw new ForbiddenException(
        "You can only view entry logs for your own house",
      );
    }

    // Spec 3.4 audit-trail requirement (b): admin fetching a single entry
    // log's photo_url must be logged.
    if (claims.role === "ADMIN") {
      await this.auditService.log({
        action: "VIEW_ENTRY_LOG_PHOTO",
        resourceType: "entry_log",
        resourceId: id,
      });
    }

    return entryLog;
  }
}
