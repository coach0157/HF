import { Module } from '@nestjs/common';

/**
 * Epic 4/5 — Guard shift management (on_duty/off_duty toggle). See
 * MVP_BACKLOG.md Epic 4 ("Guard shift API พื้นฐาน") and Epic 5 (Admin
 * Dashboard consumes this for manual shift toggling).
 *
 * Dev agent TODO:
 *  - `POST /guard-shifts` — start a shift (status ON_DUTY, shift_start =
 *    now). @Roles('GUARD', 'ADMIN') — admin can also assign/toggle shifts
 *    per Epic 5 acceptance criteria.
 *  - `PATCH /guard-shifts/:id` — end a shift (status OFF_DUTY, shift_end =
 *    now) or otherwise update it.
 *  - This module is the single source of truth for `guard_shifts` writes;
 *    ../sos reads from it (via `getTenantPrismaClient()`) for on_duty
 *    routing — don't duplicate the write logic there.
 *  - All DB access through `getTenantPrismaClient()`, not PrismaService.
 */
@Module({})
export class GuardShiftModule {}
