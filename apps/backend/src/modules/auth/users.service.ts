import {
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

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Epic 1 backlog item: "Users CRUD ระดับพื้นฐาน (backend service ให้ Admin
 * Dashboard เรียกใช้ใน Epic 5)". Admin-only (enforced by @Roles('ADMIN') in
 * users.controller.ts); this is what backs "จัดการสมาชิก: เพิ่ม/ลบลูกบ้าน,
 * ผูกบ้านเลขที่, จัดการสิทธิ์ รปภ." from spec 1.3 / backlog Epic 5.
 */
@Injectable()
export class UsersService {
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
}
