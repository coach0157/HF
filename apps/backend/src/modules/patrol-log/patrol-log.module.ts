import { Module } from "@nestjs/common";
import { PatrolLogController } from "./patrol-log.controller";
import { PatrolLogService } from "./patrol-log.service";

/**
 * Epic 12 — Guard Patrol Log (user request, see docs/PHASE2_BACKLOG.md §5).
 * No dependency on any other feature module — only Epic 0 (RLS) and Epic 1
 * (auth/RBAC), same as every other Phase 2 module's own dependency note.
 */
@Module({
  controllers: [PatrolLogController],
  providers: [PatrolLogService],
})
export class PatrolLogModule {}
