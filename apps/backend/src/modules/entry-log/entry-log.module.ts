import { Module } from "@nestjs/common";
import { VisitorPassModule } from "../visitor-pass/visitor-pass.module";
import { BlockedVisitorModule } from "../blocked-visitor/blocked-visitor.module";
import { EntryLogController } from "./entry-log.controller";
import { EntryLogService } from "./entry-log.service";
import { SensitivePhotoCleanupService } from "./sensitive-photo-cleanup.service";

/**
 * Epic 2 — Entry/Exit Log (scan + manual). See MVP_BACKLOG.md Epic 2 and
 * spec 2.1/3.3. Depends on VisitorPassModule for pass status transitions
 * (see ARCHITECTURE.md's module boundary table) — imported here rather than
 * duplicating the visitor_passes state machine. BlockedVisitorModule is a
 * second, defense-in-depth check (a QR can be issued before a block entry
 * exists — see entry-log.service.ts's createFromQr()).
 */
@Module({
  imports: [VisitorPassModule, BlockedVisitorModule],
  controllers: [EntryLogController],
  providers: [EntryLogService, SensitivePhotoCleanupService],
})
export class EntryLogModule {}
