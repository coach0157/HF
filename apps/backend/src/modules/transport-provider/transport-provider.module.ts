import { Module } from "@nestjs/common";
import { TransportProviderController } from "./transport-provider.controller";
import { TransportProviderService } from "./transport-provider.service";

/**
 * Epic 10 — Transport Directory (spec 2.7 / PHASE2_BACKLOG.md Epic 10).
 * Lowest-complexity Phase 2 module (flat CRUD, no real-time/state machine).
 */
@Module({
  controllers: [TransportProviderController],
  providers: [TransportProviderService],
})
export class TransportProviderModule {}
