import { Module } from '@nestjs/common';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService } from './announcement.service';

/**
 * Epic 3 — Announcement. See MVP_BACKLOG.md Epic 3 and spec 2.2/3.3.
 */
@Module({
  controllers: [AnnouncementController],
  providers: [AnnouncementService],
})
export class AnnouncementModule {}
