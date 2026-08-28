import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { getTenantPrismaClient } from '../../common/rls/tenant-context';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Epic 1 backlog item: "Users CRUD ระดับพื้นฐาน (backend service ให้ Admin
 * Dashboard เรียกใช้ใน Epic 5)". Admin-only (enforced by @Roles('ADMIN') in
 * users.controller.ts); this is what backs "จัดการสมาชิก: เพิ่ม/ลบลูกบ้าน,
 * ผูกบ้านเลขที่, จัดการสิทธิ์ รปภ." from spec 1.3 / backlog Epic 5.
 */
@Injectable()
export class UsersService {
  async list(filters: { role?: UserRole }) {
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.user.findMany({
      where: filters.role ? { role: filters.role } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A user with this phone number already exists in this village');
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
        houseId: dto.houseId === undefined ? undefined : dto.houseId === NIL_UUID ? null : dto.houseId,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    const tx = getTenantPrismaClient<PrismaClient>();
    try {
      await tx.user.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete a user with existing related records (e.g. recorded entry logs, visitor passes)',
        );
      }
      throw err;
    }
  }
}
