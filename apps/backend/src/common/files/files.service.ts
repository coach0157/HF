import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { promises as fs } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { getTenantPrismaClient } from "../rls/tenant-context";
import type { TenantClaims } from "../rls/tenant-context";
import { FileStorageService, PhotoBucket } from "../storage/file-storage.service";
import { AuditService } from "../audit/audit.service";
import { ChatService } from "../../modules/chat/chat.service";

/**
 * ADR-007 (docs/ARCHITECTURE.md) — backs `GET
 * /files/:bucket/:villageId/:filename`, the endpoint that actually serves
 * the bytes for every `local://bucket/village/filename` ref
 * `FileStorageService.savePhoto()` hands out (entry_logs.photo_url,
 * maintenance_tickets.image_url, chat_messages.image_url, users.avatar_url).
 * Nothing served this before — every client was putting the raw
 * `local://...` ref straight into `<img src>`/RN `<Image>`, which neither
 * platform can load.
 *
 * Authorization here is deliberately NOT a single role check — the three
 * buckets have three different sensitivity levels (spec 3.4), and the
 * "entry-logs" bucket is shared by three unrelated resource types (entry
 * logs, maintenance tickets, chat attachments — see each service's
 * `savePhoto("entry-logs", ...)` call), so serving it correctly means
 * reverse-looking-up which actual row owns the ref and applying THAT row's
 * own ownership rule, not a bucket-wide rule.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly fileStorage: FileStorageService,
    private readonly auditService: AuditService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Resolves the three route params to an absolute, existing disk path IF
   * `claims` is allowed to view it — throws NotFoundException/
   * ForbiddenException otherwise. Never returns a path for a file that
   * doesn't exist, isn't in a recognized bucket, or fails any ownership
   * check below.
   */
  async resolveFilePath(
    bucketFolder: string,
    villageId: string,
    filename: string,
    claims: TenantClaims,
  ): Promise<string> {
    // Tenant isolation, checked first and unconditionally: the path's
    // villageId must be the caller's own village. RLS (via
    // getTenantPrismaClient() below) already scopes every DB lookup this
    // service does to claims.villageId, but a mismatched path villageId
    // would otherwise still resolve to a real (wrong-tenant) file ON DISK,
    // which lives outside RLS's reach entirely — this check is what
    // actually stops that.
    if (villageId !== claims.villageId) {
      throw new NotFoundException("File not found");
    }

    const bucketKey = this.fileStorage.resolveBucketKey(bucketFolder);
    if (!bucketKey) {
      throw new NotFoundException("File not found");
    }

    const ref = `local://${bucketFolder}/${villageId}/${filename}`;
    await this.authorize(bucketKey, ref, filename, claims);

    const diskPath = this.fileStorage.resolveDiskPath(
      bucketFolder,
      villageId,
      filename,
    );
    if (!diskPath) {
      throw new NotFoundException("File not found");
    }
    try {
      await fs.access(diskPath);
    } catch {
      throw new NotFoundException("File not found");
    }
    return diskPath;
  }

  private async authorize(
    bucketKey: PhotoBucket,
    ref: string,
    filename: string,
    claims: TenantClaims,
  ): Promise<void> {
    if (bucketKey === "avatars") {
      // Low sensitivity — any authenticated user in the same village may
      // view any other member's profile picture (chat, entry-log guard/
      // admin views, staff directory all already surface other users'
      // avatarUrl to some role or another).
      return;
    }

    if (bucketKey === "sensitive-id") {
      // Spec 3.4: ID-card/plate photos are the most sensitive bucket —
      // ADMIN and GUARD only, never RESIDENT.
      if (claims.role !== "ADMIN" && claims.role !== "GUARD") {
        throw new ForbiddenException("You cannot view this photo");
      }
      if (claims.role === "ADMIN") {
        // Spec 3.4's audit-trail requirement — same AuditService.log() path
        // entry-log.service.ts's findOne()/list() already use for admin
        // access to sensitive entry-log data. `resourceId` is a `@db.Uuid`
        // column (schema.prisma's AuditLog model) but `filename` is
        // `<randomUUID()>.<ext>` (FileStorageService.savePhoto()) — strip
        // the extension so we pass a valid uuid, not a string Postgres would
        // reject outright; fall back to null if it somehow doesn't match
        // (never happens for a server-generated filename, but this must not
        // ever throw and break serving the file itself).
        const uuidMatch = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(
          filename,
        );
        await this.auditService.log({
          action: "VIEW_SENSITIVE_ID_PHOTO",
          resourceType: "sensitive_id_photo",
          resourceId: uuidMatch ? uuidMatch[0] : null,
        });
      }
      return;
    }

    // bucketKey === "entry-logs" — shared by three resource types (see this
    // class's doc comment). Reverse-lookup which one this ref actually
    // belongs to, in priority order, and defer to THAT resource's own
    // ownership rule. Every lookup goes through getTenantPrismaClient() so
    // it's RLS-scoped to claims.villageId, same as every other query in the
    // app (docs/ARCHITECTURE.md §3.1).
    const tx = getTenantPrismaClient<PrismaClient>();

    const entryLog = await tx.entryLog.findFirst({
      where: { photoUrl: ref },
    });
    if (entryLog) {
      if (claims.role === "ADMIN" || claims.role === "GUARD") return;
      if (claims.role === "RESIDENT" && entryLog.houseId === claims.houseId) {
        return;
      }
      throw new ForbiddenException("You cannot view this photo");
    }

    const ticket = await tx.maintenanceTicket.findFirst({
      where: { imageUrl: ref },
    });
    if (ticket) {
      // GUARD has no maintenance module access at all (see
      // maintenance.controller.ts — no @Roles('GUARD') anywhere on it), so
      // it has no business viewing a maintenance photo either.
      if (claims.role === "ADMIN") return;
      if (claims.role === "RESIDENT" && ticket.houseId === claims.houseId) {
        return;
      }
      throw new ForbiddenException("You cannot view this photo");
    }

    const message = await tx.chatMessage.findFirst({
      where: { imageUrl: ref },
    });
    if (message) {
      // Reuses ChatService's own room-membership check (ADR-005 point 4,
      // docs/ARCHITECTURE.md §8.2) instead of a second hand-rolled copy —
      // throws ForbiddenException itself if `claims.userId` isn't a
      // participant of `message.chatRoomId`. Deliberately no ADMIN bypass:
      // an admin who isn't a participant of THIS room must not be able to
      // read its photos, same as they can't read its text messages.
      await this.chatService.assertCanJoin(message.chatRoomId, claims);
      return;
    }

    // Orphaned ref (e.g. the row was deleted, or this is simply a made-up
    // filename) — reject the same way as any other unrecognized file.
    throw new NotFoundException("File not found");
  }
}
