import { Module } from "@nestjs/common";
import { VisitorPassModule } from "../visitor-pass/visitor-pass.module";
import { EntryLogController } from "./entry-log.controller";
import { EntryLogService } from "./entry-log.service";
import { SensitivePhotoCleanupService } from "./sensitive-photo-cleanup.service";

/**
 * Epic 2 — Entry/Exit Log (scan + manual). See MVP_BACKLOG.md Epic 2 and
 * spec 2.1/3.3. Depends on VisitorPassModule for pass status transitions
 * (see ARCHITECTURE.md's module boundary table) — imported here rather than
 * duplicating the visitor_passes state machine.
 */
@Module({
  imports: [VisitorPassModule],
  controllers: [EntryLogController],
  providers: [EntryLogService, SensitivePhotoCleanupService],
})
export class EntryLogModule {}
