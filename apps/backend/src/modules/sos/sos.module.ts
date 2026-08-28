import { Module } from "@nestjs/common";
import { SosController } from "./sos.controller";
import { SosService } from "./sos.service";

/**
 * Epic 4 — SOS / Emergency Alert. See MVP_BACKLOG.md Epic 4 and spec 2.2/3.4.
 * Reads (never writes) `guard_shifts` for on-duty routing — ../guard-shift
 * owns the on_duty/off_duty toggle writes.
 */
@Module({
  controllers: [SosController],
  providers: [SosService],
})
export class SosModule {}
