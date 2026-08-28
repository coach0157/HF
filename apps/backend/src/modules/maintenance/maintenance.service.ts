import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MaintenanceCategory,
  MaintenanceStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { FileStorageService } from "../../common/storage/file-storage.service";
import { CreateMaintenanceTicketDto } from "./dto/create-maintenance-ticket.dto";
import { AssignMaintenanceTicketDto } from "./dto/assign-maintenance-ticket.dto";
import { UpdateMaintenanceTicketStatusDto } from "./dto/update-maintenance-ticket-status.dto";

export interface ListMaintenanceTicketsFilters {
  status?: MaintenanceStatus;
  category?: MaintenanceCategory;
  page: number;
  pageSize: number;
}

/**
 * Epic 9 — Maintenance (spec 2.4 / PHASE2_BACKLOG.md Epic 9). Pattern mirrors
 * entry-log.service.ts (ownership scoping + file-storage photo upload) and
 * sos.service.ts (forward-only status transition guard via
 * BadRequestException).
 */
@Injectable()
export class MaintenanceService {
  constructor(private readonly fileStorage: FileStorageService) {}

  /**
   * Generates the next `ticketNumber` for `claims.villageId`, race-safe under
   * concurrent creation from the same village. `INSERT ... ON CONFLICT DO
   * UPDATE ... RETURNING` is a single atomic statement: Postgres takes a row
   * lock on the (village_id) counter row for the duration, so two concurrent
   * requests for the same village are serialized by the database itself —
   * not by application-level locking — and each gets a distinct sequence
   * number. This also self-seeds the counter row on a village's very first
   * ticket (no separate "does a counter row exist yet" branch needed).
   *
   * Runs inside the SAME RLS-scoped transaction as the ticket INSERT (both
   * go through the one `tx` from `getTenantPrismaClient()`, which is the
   * single transaction RlsInterceptor opened for this request) — so if the
   * ticket insert fails afterward, the counter increment rolls back with it
   * and no sequence number is burned.
   */
  private async nextTicketNumber(
    tx: PrismaClient,
    villageId: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ last_seq: number | bigint }[]>`
      INSERT INTO maintenance_ticket_counters (village_id, last_seq)
      VALUES (${villageId}::uuid, 1)
      ON CONFLICT (village_id)
      DO UPDATE SET last_seq = maintenance_ticket_counters.last_seq + 1
      RETURNING last_seq
    `;
    const seq = Number(rows[0].last_seq);
    // "MT-" + zero-padded sequence (e.g. "MT-000001") — human-readable,
    // sequential per village, satisfies spec 2.4's "ระบบสร้างเลขที่ใบงาน".
    // No spec-mandated format exists, so this is a documented judgment call.
    return `MT-${String(seq).padStart(6, "0")}`;
  }

  async create(dto: CreateMaintenanceTicketDto, claims: TenantClaims) {
    if (!claims.houseId) {
      throw new BadRequestException(
        "Only a resident with a house assigned can file a maintenance ticket",
      );
    }
    const tx = getTenantPrismaClient<PrismaClient>();

    const photoUrl = dto.photoDataUrl
      ? await this.fileStorage.savePhoto(
          "entry-logs",
          claims.villageId,
          dto.photoDataUrl,
        )
      : undefined;

    const ticketNumber = await this.nextTicketNumber(tx, claims.villageId);

    return tx.maintenanceTicket.create({
      data: {
        villageId: claims.villageId,
        houseId: claims.houseId,
        createdByUserId: claims.userId,
        category: dto.category,
        description: dto.description,
        imageUrl: photoUrl,
        status: MaintenanceStatus.OPEN,
        ticketNumber,
      },
    });
  }

  async list(filters: ListMaintenanceTicketsFilters, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const where: Prisma.MaintenanceTicketWhereInput = {};

    if (claims.role === "RESIDENT") {
      // Residents only ever see their own house's tickets (spec 2.4 /
      // PHASE2_BACKLOG.md AC) — never trust a house scope from the client,
      // there isn't one to trust here in the first place.
      if (!claims.houseId) {
        return {
          items: [],
          total: 0,
          page: filters.page,
          pageSize: filters.pageSize,
        };
      }
      where.houseId = claims.houseId;
    }
    // ADMIN sees every ticket in the village (RLS already scopes to the
    // village; no houseId filter here). GUARD has no @Roles() access to this
    // module at all (see maintenance.controller.ts) — maintenance isn't a
    // guard concern per spec 2.4.

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.category) {
      where.category = filters.category;
    }

    const [items, total] = await Promise.all([
      tx.maintenanceTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      tx.maintenanceTicket.count({ where }),
    ]);

    return { items, total, page: filters.page, pageSize: filters.pageSize };
  }

  async findOne(id: string, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const ticket = await tx.maintenanceTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException("Maintenance ticket not found");
    }
    if (claims.role === "RESIDENT" && ticket.houseId !== claims.houseId) {
      throw new ForbiddenException(
        "You can only view maintenance tickets for your own house",
      );
    }
    return ticket;
  }

  /**
   * Sets `assignedTo` + `scheduledDate` and — the first time a ticket is
   * assigned — advances OPEN -> IN_PROGRESS (spec 2.4: "แอดมินมอบหมายงานให้
   * ทีมช่างได้ พร้อมกำหนดวันนัดหมาย").
   *
   * Design decision (backlog doesn't spell this out explicitly, so documented
   * here): assign is allowed while the ticket is OPEN (normal path, advances
   * it to IN_PROGRESS) or already IN_PROGRESS (re-assign/reschedule to a
   * different team without changing status — real repair teams do get
   * swapped/rescheduled). It is rejected once a ticket is DONE — a completed
   * job shouldn't be re-assigned; open a new ticket instead.
   */
  async assign(
    id: string,
    dto: AssignMaintenanceTicketDto,
    claims: TenantClaims,
  ) {
    void claims;
    const tx = getTenantPrismaClient<PrismaClient>();
    const ticket = await tx.maintenanceTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException("Maintenance ticket not found");
    }
    if (ticket.status === MaintenanceStatus.DONE) {
      throw new BadRequestException(
        "Cannot assign a maintenance ticket that is already done",
      );
    }

    return tx.maintenanceTicket.update({
      where: { id },
      data: {
        assignedTo: dto.assignedTo,
        scheduledDate: new Date(dto.scheduledDate),
        status:
          ticket.status === MaintenanceStatus.OPEN
            ? MaintenanceStatus.IN_PROGRESS
            : ticket.status,
      },
    });
  }

  /**
   * Status transition rule (spec 2.4 / PHASE2_BACKLOG.md AC: "สถานะไปข้างหน้า
   * เท่านั้น: OPEN -> IN_PROGRESS -> DONE — ปฏิเสธการข้ามขั้น/ย้อนกลับ").
   *
   * This endpoint deliberately only accepts the IN_PROGRESS -> DONE step.
   * OPEN -> IN_PROGRESS is intentionally NOT reachable here even though it's
   * "forward" — that transition is owned exclusively by `assign()` above,
   * because moving a ticket into IN_PROGRESS without a technician/team
   * assigned (assignedTo + scheduledDate) would be a nonsensical state for
   * spec 2.4's "กำลังดำเนินการ" (work is actively happening, by someone,
   * on some date). Keeping one transition per endpoint also makes each
   * guard trivial to reason about instead of one generic state-machine table.
   * Any other requested target (OPEN, a repeat of the current status, or a
   * skip straight to DONE from OPEN) is rejected with 400.
   */
  async updateStatus(
    id: string,
    dto: UpdateMaintenanceTicketStatusDto,
    claims: TenantClaims,
  ) {
    void claims;
    const tx = getTenantPrismaClient<PrismaClient>();
    const ticket = await tx.maintenanceTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw new NotFoundException("Maintenance ticket not found");
    }

    if (
      ticket.status !== MaintenanceStatus.IN_PROGRESS ||
      dto.status !== MaintenanceStatus.DONE
    ) {
      throw new BadRequestException(
        `Cannot change status from ${ticket.status} to ${dto.status}. ` +
          "Only IN_PROGRESS -> DONE is allowed here; OPEN -> IN_PROGRESS " +
          "happens via PATCH /maintenance-tickets/:id/assign.",
      );
    }

    return tx.maintenanceTicket.update({
      where: { id },
      data: { status: MaintenanceStatus.DONE },
    });
  }
}
