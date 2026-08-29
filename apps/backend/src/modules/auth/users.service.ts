import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateAvatarDto } from "./dto/update-avatar.dto";
import { FileStorageService } from "../../common/storage/file-storage.service";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Dev-agent addition (avatar upload feature). Generous enough for a
// resized profile photo (the mobile client crops to a square and
// compresses before base64-encoding — see ProfileScreen.tsx's
// pickAndUploadAvatar()), small enough to keep this MVP's local-disk
// "uploads/" folder sane with no real object storage behind it.
const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Epic 1 backlog item: "Users CRUD ระดับพื้นฐาน (backend service ให้ Admin
 * Dashboard เรียกใช้ใน Epic 5)". Admin-only (enforced by @Roles('ADMIN') in
 * users.controller.ts); this is what backs "จัดการสมาชิก: เพิ่ม/ลบลูกบ้าน,
 * ผูกบ้านเลขที่, จัดการสิทธิ์ รปภ." from spec 1.3 / backlog Epic 5.
 */
@Injectable()
export class UsersService {
  constructor(private readonly fileStorage: FileStorageService) {}

  /**
   * `claims` is required as of Epic 8 (Chat) — RESIDENT/GUARD callers get a
   * restricted "staff directory" view (see below), not the full unfiltered
   * list ADMIN gets. Every existing ADMIN-only caller (admin-web's
   * MembersPage) is unaffected — `claims.role === 'ADMIN'` still returns
   * exactly what it always did.
   *
   * Dev-agent decision (not covered by ADR-004/005, needed to unblock Epic
   * 8's mobile resident chat screen): a resident starting a 1:1 chat with
   * "นิติบุคคล"/"รปภ." (spec 1.1) needs SOME way to discover who to
   * message, but `GET /users` was ADMIN-only. Opening it up to
   * RESIDENT/GUARD unrestricted would resurrect exactly the "resident
   * directory" spec 2.7 explicitly chose NOT to build ("ไม่ทำ resident
   * directory (ความเป็นส่วนตัว/ยินยอมซับซ้อนเกินความจำเป็นของ MVP)") — so a
   * non-ADMIN caller is hard-limited to ADMIN/GUARD rows only, regardless of
   * what `role` filter they pass; a RESIDENT can never enumerate other
   * residents through this endpoint. Staff (admin/guard) contact info isn't
   * the same privacy concern — they're official village points of contact,
   * not private individuals.
   */
  async list(filters: { role?: UserRole }, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();

    if (claims.role === "ADMIN") {
      return tx.user.findMany({
        where: filters.role ? { role: filters.role } : undefined,
        orderBy: { createdAt: "desc" },
      });
    }

    const staffRole =
      filters.role === "GUARD"
        ? "GUARD"
        : filters.role === "ADMIN"
          ? "ADMIN"
          : undefined;
    return tx.user.findMany({
      where: { role: staffRole ?? { in: ["ADMIN", "GUARD"] } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * `claims` is omitted by internal callers (update()/remove()'s existence
   * checks below) that already sit behind @Roles('ADMIN') at the controller
   * — the ownership check only applies to the RESIDENT/GUARD-reachable
   * `GET /users/:id` path (users.controller.ts), where it matters: a
   * resident must only ever see their own record, never another house's.
   */
  async findOne(id: string, claims?: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");
    if (claims?.role === "RESIDENT" && user.id !== claims.userId) {
      throw new ForbiddenException("You can only view your own user record");
    }
    return user;
  }

  async create(dto: CreateUserDto, villageId: string) {
    const tx = getTenantPrismaClient<PrismaClient>();
    try {
      return await tx.user.create({
        data: {
          villageId,
          name: dto.name,
          phone: dto.phone,
          role: dto.role,
          houseId: dto.houseId ?? null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          "A user with this phone number already exists in this village",
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        houseId:
          dto.houseId === undefined
            ? undefined
            : dto.houseId === NIL_UUID
              ? null
              : dto.houseId,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    const tx = getTenantPrismaClient<PrismaClient>();
    try {
      await tx.user.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2003"
      ) {
        throw new ConflictException(
          "Cannot delete a user with existing related records (e.g. recorded entry logs, visitor passes)",
        );
      }
      throw err;
    }
  }

  /**
   * Avatar upload feature (Dev-agent addition, requested outside the
   * original spec — see MVP_BACKLOG.md; nothing in spec 1.1/2.x asked for a
   * profile picture). Every role may call this, but ONLY for their own
   * record (`claims.userId`, never a `:id` param) — there is deliberately
   * no admin-sets-someone-else's-avatar path.
   *
   * Format/size validation happens here rather than in the DTO
   * (class-validator can't inspect decoded base64 length) and rather than
   * in FileStorageService.savePhoto() (which stays a generic "any bucket,
   * any image/* mime" writer used by entry-log/chat/maintenance too —
   * narrowing its accepted mime set or adding a size cap there would change
   * behavior for those unrelated features, which is out of scope here).
   */
  async updateAvatar(dto: UpdateAvatarDto, claims: TenantClaims) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(
      dto.photoDataUrl,
    );
    if (!match) {
      throw new BadRequestException(
        'photoDataUrl must be a base64 image data URL, e.g. "data:image/jpeg;base64,<...>"',
      );
    }
    const [, mime, base64Data] = match;
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mime.toLowerCase())) {
      throw new BadRequestException(
        `Unsupported avatar image type "${mime}" — allowed: ${[...ALLOWED_AVATAR_MIME_TYPES].join(", ")}`,
      );
    }
    // Fast pre-check on the base64 string length (~4/3 of decoded byte
    // size) so an oversized upload is rejected before ever hitting disk.
    const approxDecodedBytes = Math.floor((base64Data.length * 3) / 4);
    if (approxDecodedBytes > MAX_AVATAR_BYTES) {
      throw new BadRequestException(
        `Avatar image is too large (max ${MAX_AVATAR_BYTES / (1024 * 1024)}MB)`,
      );
    }

    const tx = getTenantPrismaClient<PrismaClient>();
    const previous = await tx.user.findUnique({
      where: { id: claims.userId },
    });
    if (!previous) {
      throw new NotFoundException("User not found");
    }

    const avatarUrl = await this.fileStorage.savePhoto(
      "avatars",
      claims.villageId,
      dto.photoDataUrl,
    );
    const updated = await tx.user.update({
      where: { id: claims.userId },
      data: { avatarUrl },
    });

    // Best-effort cleanup of the old avatar file — not the entry_logs-style
    // "clear the dangling reference" case (this bucket isn't swept by
    // SensitivePhotoCleanupService), just avoiding leaking a superseded
    // file on local disk forever. Never blocks/fails the response.
    if (previous.avatarUrl && previous.avatarUrl !== avatarUrl) {
      await this.fileStorage.delete(previous.avatarUrl);
    }

    return updated;
  }
}
