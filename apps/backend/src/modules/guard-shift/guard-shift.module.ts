import { Module } from "@nestjs/common";
import { GuardShiftController } from "./guard-shift.controller";
import { GuardShiftService } from "./guard-shift.service";

/**
 * Epic 4/5 — Guard shift management (on_duty/off_duty toggle). See
 * MVP_BACKLOG.md Epic 4 and Epic 5. This module is the single source of
 * truth for `guard_shifts` writes; ../sos reads from it (via
 * getTenantPrismaClient()) for on_duty routing.
 */
@Module({
  controllers: [GuardShiftController],
  providers: [GuardShiftService],
})
export class GuardShiftModule {}
