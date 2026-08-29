import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export type PhotoBucket = "entry-logs" | "sensitive-id" | "avatars";

/**
 * Spec 3.4: "แยกนโยบายเก็บข้อมูลภาพบัตรประชาชน/ทะเบียนรถออกจากประวัติเข้า-ออกทั่วไป" —
 * ID-card/plate photos are more sensitive than a general entry-log photo and
 * need a separate bucket/permission + shorter retention (90 days) than the
 * entry_logs row itself (6 months, spec 2.1).
 *
 * This is a LOCAL-DISK implementation of that bucket split, not a real S3/R2
 * client — there are no S3 credentials available in this dev/MVP
 * environment (S3_ACCESS_KEY_ID etc. are blank in .env.example). The two
 * "buckets" are two top-level folders under `uploads/`, named after the
 * S3_BUCKET_* env vars so swapping in a real S3 SDK later is a drop-in
 * replacement of this one class (same method signatures: save() returns a
 * URL-shaped string, delete() takes that same string back) — no caller code
 * would need to change.
 *
 * Photos are accepted as base64 data URLs (`data:<mime>;base64,<data>`) in
 * request bodies rather than multipart/form-data, to avoid pulling in a
 * multer/S3 multipart pipeline for an MVP that has no real object storage
 * wired up yet.
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly rootDir: string;
  private readonly bucketNames: Record<PhotoBucket, string>;

  constructor(private readonly config: ConfigService) {
    this.rootDir = path.resolve(process.cwd(), "uploads");
    this.bucketNames = {
      "entry-logs": this.config.get<string>(
        "S3_BUCKET_ENTRY_LOGS",
        "village-entry-logs",
      ),
      "sensitive-id": this.config.get<string>(
        "S3_BUCKET_SENSITIVE_ID",
        "village-sensitive-id-photos",
      ),
      // Dev-agent addition (avatar upload feature). Deliberately NOT covered
      // by listStaleSensitivePhotos()/SensitivePhotoCleanupService below —
      // those only ever enumerate the "sensitive-id" bucket by name, so a
      // profile picture is never swept by the 90-day ID-photo retention job.
      avatars: this.config.get<string>(
        "S3_BUCKET_AVATARS",
        "village-avatars",
      ),
    };
  }

  /**
   * Saves a base64 data-URL photo into the given bucket and returns a
   * stable reference string (`local://<bucket>/<village>/<filename>`) that
   * is stored verbatim in `entry_logs.photo_url`. Not a real HTTP URL on
   * purpose — a real S3/R2 swap would return a signed/public URL instead,
   * but nothing downstream should assume the string is directly fetchable
   * in this local dev implementation.
   */
  async savePhoto(
    bucket: PhotoBucket,
    villageId: string,
    dataUrl: string,
  ): Promise<string> {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      throw new BadRequestException(
        'photo must be a base64 data URL, e.g. "data:image/jpeg;base64,<...>"',
      );
    }
    const [, mime, base64Data] = match;
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "bin";
    const filename = `${randomUUID()}.${ext}`;
    const dir = path.join(this.rootDir, this.bucketNames[bucket], villageId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, Buffer.from(base64Data, "base64"));

    const ref = `local://${this.bucketNames[bucket]}/${villageId}/${filename}`;
    this.logger.debug(`Saved photo to ${filePath} (ref=${ref})`);
    return ref;
  }

  /** Resolves a `local://bucket/village/filename` ref back to a disk path. */
  private refToPath(ref: string): string | null {
    const match = /^local:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(ref);
    if (!match) return null;
    const [, , villageId, filename] = match;
    // Bucket folder name is looked up by value, not trusted from the ref,
    // to avoid path traversal via a crafted photo_url.
    const bucketFolder = match[1];
    const knownFolder = Object.values(this.bucketNames).includes(bucketFolder)
      ? bucketFolder
      : null;
    if (!knownFolder) return null;
    return path.join(this.rootDir, knownFolder, villageId, filename);
  }

  async delete(ref: string): Promise<void> {
    const filePath = this.refToPath(ref);
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn(
          `Failed to delete ${filePath}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Lists every stored ref in the sensitive-id bucket older than `maxAgeMs`,
   * used by the 90-day auto-delete cron (see entry-log module). Only ever
   * touches the sensitive bucket, per spec 3.4's shorter retention for ID
   * photos — general entry-log photos follow the 6-month entry_logs row
   * retention instead and are NOT cleaned up by this method.
   */
  async listStaleSensitivePhotos(maxAgeMs: number): Promise<string[]> {
    const bucketDir = path.join(this.rootDir, this.bucketNames["sensitive-id"]);
    const refs: string[] = [];
    let villageDirs: string[];
    try {
      villageDirs = await fs.readdir(bucketDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const now = Date.now();
    for (const villageId of villageDirs) {
      const villageDir = path.join(bucketDir, villageId);
      const files = await fs.readdir(villageDir).catch(() => []);
      for (const filename of files) {
        const filePath = path.join(villageDir, filename);
        const stat = await fs.stat(filePath).catch(() => null);
        if (stat && now - stat.mtimeMs > maxAgeMs) {
          refs.push(
            `local://${this.bucketNames["sensitive-id"]}/${villageId}/${filename}`,
          );
        }
      }
    }
    return refs;
  }
}
