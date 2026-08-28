import { Module } from "@nestjs/common";
import { HouseController } from "./house.controller";
import { HouseService } from "./house.service";

/**
 * Dev-agent addition, discovered as a blocking gap while implementing the
 * Admin Dashboard (Epic 5): spec 3.2's ER model has a `houses` table but
 * spec 3.3's endpoint list never names a `/houses` resource, and no module
 * for it existed anywhere in the backend. Without it there was no way to:
 *  - create a house record at all beyond the one row prisma/seed.ts inserts
 *  - resolve a `house_id` FK (on `users`, `sos_alerts`) to a human-readable
 *    house number for display (Epic 5 acceptance criteria: "ผูกบ้านเลขที่",
 *    "แสดงพิกัด/เลขที่บ้าน" on the SOS dashboard)
 * Kept intentionally small (list/get/create only — no update/delete, not
 * needed by any MVP screen) rather than a full CRUD module.
 */
@Module({
  controllers: [HouseController],
  providers: [HouseService],
  exports: [HouseService],
})
export class HouseModule {}
