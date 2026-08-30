import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { GuardShiftStatus, PrismaClient, SosStatus } from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { PushNotificationService } from "../../common/push/push-notification.service";
import { CreateSosAlertDto } from "./dto/create-sos-alert.dto";

/**
 * Epic 4 — SOS / Emergency Alert. See MVP_BACKLOG.md Epic 4 and spec
 * 2.2/3.4. Routing is the core requirement: only guards who are currently
 * `ON_DUTY` (per ../guard-shift's writes) ever get an alert — an off-duty
 * guard must never receive one, even if they were on duty five minutes ago.
 */
@Injectable()
export class SosService {
  constructor(
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async trigger(dto: CreateSosAlertDto, claims: TenantClaims) {
    if (!claims.houseId) {
      throw new BadRequestException(
        "Only a resident with a house assignment can trigger SOS",
      );
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    const alert = await tx.sosAlert.create({
      data: {
        villageId: claims.villageId,
        triggeredByUserId: claims.userId,
        houseId: claims.houseId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        status: SosStatus.PENDING,
      },
    });

    // Routing: on-duty guards ONLY (spec 2.2 — "ห้ามส่งไปหา รปภ. ที่เลิกกะแล้ว").
    // `shiftEnd: null` guards against a stale ON_DUTY row that was never
    // properly closed out.
    const onDutyGuards = await tx.guardShift.findMany({
      where: {
        villageId: claims.villageId,
        status: GuardShiftStatus.ON_DUTY,
        shiftEnd: null,
      },
      select: { guardUserId: true },
    });

    const routedToGuardUserIds = onDutyGuards.map((g) => g.guardUserId);

    // Epic 11 (ADR-006): fire-and-forget push to every routed on-duty
    // guard — never awaited, so a slow/degraded Expo API can never delay
    // this response (the resident's confirmation that the SOS is durably
    // recorded + routed). See ADR-006's dedicated SOS reasoning for why
    // this is true even for the single most safety-critical trigger.
    // Routing itself (deciding WHO gets notified) is unaffected — it
    // already fully resolved above, independent of push delivery.
    this.pushNotificationService.send(
      routedToGuardUserIds,
      {
        title: "🚨 แจ้งเหตุฉุกเฉิน SOS",
        body: "มีการแจ้งเหตุฉุกเฉินจากลูกบ้าน กรุณาตรวจสอบทันที",
        data: { type: "sos", id: alert.id },
      },
      claims,
    );

    // TODO(Dev agent, future): optional neighbor notification within a
    // configurable radius (spec 2.2, haversine over houses.latitude/
    // longitude) — intentionally left OFF; needs a village-level setting
    // that doesn't exist yet in schema.prisma (no `villages.sos_radius_m`
    // or similar column), so this is a schema gap, not a missed wiring step.

    return {
      alert,
      routedToGuardUserIds,
    };
  }

  async acknowledge(id: string, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const alert = await tx.sosAlert.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException("SOS alert not found");
    }
    if (alert.status !== SosStatus.PENDING) {
      throw new BadRequestException(
        `Cannot acknowledge an alert with status ${alert.status}`,
      );
    }

    return tx.sosAlert.update({
      where: { id },
      data: {
        status: SosStatus.ACKNOWLEDGED,
        acknowledgedByGuardId: claims.userId,
      },
    });
  }

  /**
   * Not in spec 3.3's literal endpoint list (only `acknowledge` is named
   * there) but a natural completion of the state machine the schema already
   * models (`sos_alerts.status` includes RESOLVED, `resolved_at` column
   * exists and was otherwise dead). Guard-only, same as acknowledge.
   */
  async resolve(id: string, _claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const alert = await tx.sosAlert.findUnique({ where: { id } });
    if (!alert) {
      throw new NotFoundException("SOS alert not found");
    }
    if (alert.status !== SosStatus.ACKNOWLEDGED) {
      throw new BadRequestException(
        `Cannot resolve an alert with status ${alert.status}`,
      );
    }

    return tx.sosAlert.update({
      where: { id },
      data: { status: SosStatus.RESOLVED, resolvedAt: new Date() },
    });
  }

  async list(filters: { status?: SosStatus }) {
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.sosAlert.findMany({
      where: { status: filters.status },
      orderBy: { createdAt: "desc" },
    });
  }
}
