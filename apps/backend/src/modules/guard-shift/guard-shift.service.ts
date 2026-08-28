import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { GuardShiftStatus, PrismaClient } from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { CreateGuardShiftDto } from "./dto/create-guard-shift.dto";

/**
 * Epic 4/5 — Guard shift management. Single source of truth for
 * `guard_shifts` writes (see ARCHITECTURE.md's module boundary table) —
 * SosModule only ever READS this table for on-duty routing, never writes it.
 */
@Injectable()
export class GuardShiftService {
  async start(dto: CreateGuardShiftDto, claims: TenantClaims) {
    if (
      claims.role !== "ADMIN" &&
      dto.guardUserId &&
      dto.guardUserId !== claims.userId
    ) {
      throw new ForbiddenException("Guards can only start their own shift");
    }
    const guardUserId = dto.guardUserId ?? claims.userId;

    const tx = getTenantPrismaClient<PrismaClient>();
    const guard = await tx.user.findUnique({ where: { id: guardUserId } });
    if (!guard || guard.role !== "GUARD") {
      throw new BadRequestException(
        "guardUserId must reference a user with role GUARD",
      );
    }

    const existingOpen = await tx.guardShift.findFirst({
      where: { guardUserId, status: GuardShiftStatus.ON_DUTY, shiftEnd: null },
    });
    if (existingOpen) {
      throw new BadRequestException("This guard already has an open shift");
    }

    return tx.guardShift.create({
      data: {
        villageId: claims.villageId,
        guardUserId,
        shiftStart: new Date(),
        status: GuardShiftStatus.ON_DUTY,
      },
    });
  }

  async end(id: string, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const shift = await tx.guardShift.findUnique({ where: { id } });
    if (!shift) {
      throw new NotFoundException("Guard shift not found");
    }
    if (claims.role !== "ADMIN" && shift.guardUserId !== claims.userId) {
      throw new ForbiddenException("You can only end your own shift");
    }
    if (shift.status === GuardShiftStatus.OFF_DUTY) {
      return shift; // idempotent
    }

    return tx.guardShift.update({
      where: { id },
      data: { status: GuardShiftStatus.OFF_DUTY, shiftEnd: new Date() },
    });
  }

  async list(filters: { status?: GuardShiftStatus; guardUserId?: string }) {
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.guardShift.findMany({
      where: {
        status: filters.status,
        guardUserId: filters.guardUserId,
      },
      orderBy: { shiftStart: "desc" },
    });
  }
}
