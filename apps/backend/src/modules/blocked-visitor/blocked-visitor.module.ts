import { Module } from "@nestjs/common";
import { BlockedVisitorController } from "./blocked-visitor.controller";
import { BlockedVisitorService } from "./blocked-visitor.service";

/**
 * User-requested add-on (docs/PHASE2_BACKLOG.md §6 (Epic 13)). Exported so
 * VisitorPassModule and EntryLogModule can call assertNotBlocked() before
 * issuing a QR / recording an entry — see those modules' imports.
 */
@Module({
  controllers: [BlockedVisitorController],
  providers: [BlockedVisitorService],
  exports: [BlockedVisitorService],
})
export class BlockedVisitorModule {}
