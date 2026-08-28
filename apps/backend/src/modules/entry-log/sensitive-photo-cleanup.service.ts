import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { FileStorageService } from "../../common/storage/file-storage.service";
import { PrismaService } from "../../common/prisma/prisma.service";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Epic 2 backlog item: "job auto-delete รูปบัตร ปชช. หลัง 90 วัน" (spec 3.4:
 * ID-card/plate photos get a SHORTER retention than the entry_logs row
 * itself, which is kept 6 months per spec 2.1). Only ever touches the
 * sensitive-id bucket's files and the dangling `photo_url` reference on
 * `entry_logs` — the row itself stays for the full 6-month history/search
 * retention; only the actual photo bytes (and the now-broken reference to
 * them) are cleared early.
 *
 * This is genuinely cross-tenant, system-level code (a cron job, not a
 * request handler), so per docs/ARCHITECTURE.md §2 it injects `PrismaService`
 * directly rather than `getTenantPrismaClient()` — there is no per-request
 * RLS context for a scheduled job to run inside, and this needs to clear
 * `photo_url` across every village's stale photos in one pass.
 */
@Injectable()
export class SensitivePhotoCleanupService {
  private readonly logger = new Logger(SensitivePhotoCleanupService.name);

  constructor(
    private readonly fileStorage: FileStorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    await this.cleanup();
  }

  /** Exposed directly (not just via @Cron) so it's easy to unit test / trigger manually. */
  async cleanup(): Promise<number> {
    const stale =
      await this.fileStorage.listStaleSensitivePhotos(NINETY_DAYS_MS);
    for (const ref of stale) {
      await this.fileStorage.delete(ref);
      // Clear the now-dangling reference so an admin viewing an old entry
      // log after 90 days sees a clean "photo deleted" state (null) rather
      // than a photo_url pointing at a file that no longer exists. Scoped by
      // photoUrl equality (not id) since a stale ref could in principle be
      // orphaned already; updateMany is a safe no-op if no row matches.
      await this.prisma.entryLog.updateMany({
        where: { photoUrl: ref },
        data: { photoUrl: null },
      });
    }
    if (stale.length > 0) {
      this.logger.log(
        `Deleted ${stale.length} sensitive ID photo(s) older than 90 days`,
      );
    }
    return stale.length;
  }
}
