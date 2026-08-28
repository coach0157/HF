import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FileStorageService } from '../../common/storage/file-storage.service';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Epic 2 backlog item: "job auto-delete รูปบัตร ปชช. หลัง 90 วัน" (spec 3.4:
 * ID-card/plate photos get a SHORTER retention than the entry_logs row
 * itself, which is kept 6 months per spec 2.1). Only ever touches the
 * sensitive-id bucket's files, never the entry_logs rows — the row (with a
 * now-dangling photo_url) stays for the full 6-month history/search
 * retention; only the actual photo bytes are deleted early.
 *
 * NOTE: this does not currently null out `entry_logs.photo_url` after
 * deleting the file, so an admin viewing an old entry log after 90 days
 * will get a broken reference rather than a clean "photo deleted" state.
 * Acceptable for MVP (the retention requirement itself is met — the
 * sensitive image data is gone) but flagged for QA / a follow-up cleanup
 * pass that also clears the column.
 */
@Injectable()
export class SensitivePhotoCleanupService {
  private readonly logger = new Logger(SensitivePhotoCleanupService.name);

  constructor(private readonly fileStorage: FileStorageService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    await this.cleanup();
  }

  /** Exposed directly (not just via @Cron) so it's easy to unit test / trigger manually. */
  async cleanup(): Promise<number> {
    const stale = await this.fileStorage.listStaleSensitivePhotos(NINETY_DAYS_MS);
    for (const ref of stale) {
      await this.fileStorage.delete(ref);
    }
    if (stale.length > 0) {
      this.logger.log(`Deleted ${stale.length} sensitive ID photo(s) older than 90 days`);
    }
    return stale.length;
  }
}
