import * as path from "node:path";
import { FileStorageService } from "./file-storage.service";

function makeService(): FileStorageService {
  // Real ConfigService isn't needed for these two methods — they only ever
  // read `this.bucketNames`/`this.rootDir`, both set in the constructor from
  // whatever `config.get()` returns (defaults used here, same as every env
  // that doesn't override S3_BUCKET_*).
  const config = { get: (_key: string, fallback?: string) => fallback } as any;
  return new FileStorageService(config);
}

describe("FileStorageService — resolveBucketKey / resolveDiskPath (ADR-007)", () => {
  let service: FileStorageService;

  beforeEach(() => {
    service = makeService();
  });

  describe("resolveBucketKey", () => {
    it("maps each configured bucket folder name back to its PhotoBucket key", () => {
      expect(service.resolveBucketKey("village-entry-logs")).toBe("entry-logs");
      expect(service.resolveBucketKey("village-sensitive-id-photos")).toBe(
        "sensitive-id",
      );
      expect(service.resolveBucketKey("village-avatars")).toBe("avatars");
    });

    it("returns null for an unrecognized folder name", () => {
      expect(service.resolveBucketKey("not-a-real-bucket")).toBeNull();
    });
  });

  describe("resolveDiskPath", () => {
    it("joins root/bucket/village/filename for a known bucket + safe segments", () => {
      const result = service.resolveDiskPath(
        "village-avatars",
        "village-1",
        "photo.jpg",
      );
      expect(result).toBe(
        path.join(process.cwd(), "uploads", "village-avatars", "village-1", "photo.jpg"),
      );
    });

    it("returns null for an unrecognized bucket folder", () => {
      expect(
        service.resolveDiskPath("not-a-real-bucket", "village-1", "photo.jpg"),
      ).toBeNull();
    });

    // Path-traversal guard — villageId/filename here come straight from an
    // untrusted request path segment (GET /files/:bucket/:villageId/:filename),
    // unlike savePhoto()'s own server-generated randomUUID() filename.
    it.each([
      ["..", "photo.jpg"],
      ["village-1", ".."],
      ["../../etc", "passwd"],
      ["village-1", "../../secrets.env"],
      ["vil/lage", "photo.jpg"],
      ["village-1", "sub\\dir.jpg"],
    ])("rejects an unsafe segment (villageId=%p, filename=%p)", (villageId, filename) => {
      expect(service.resolveDiskPath("village-avatars", villageId, filename)).toBeNull();
    });
  });
});
