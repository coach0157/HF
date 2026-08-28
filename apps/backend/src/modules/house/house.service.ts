import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { getTenantPrismaClient } from "../../common/rls/tenant-context";
import type { TenantClaims } from "../../common/rls/tenant-context";
import { CreateHouseDto } from "./dto/create-house.dto";

@Injectable()
export class HouseService {
  async list(filters: { zone?: string }) {
    const tx = getTenantPrismaClient<PrismaClient>();
    return tx.house.findMany({
      where: filters.zone ? { zone: filters.zone } : undefined,
      orderBy: { houseNo: "asc" },
    });
  }

  async findOne(id: string) {
    const tx = getTenantPrismaClient<PrismaClient>();
    const house = await tx.house.findUnique({ where: { id } });
    if (!house) throw new NotFoundException("House not found");
    return house;
  }

  async create(dto: CreateHouseDto, claims: TenantClaims) {
    const tx = getTenantPrismaClient<PrismaClient>();
    try {
      return await tx.house.create({
        data: {
          villageId: claims.villageId,
          houseNo: dto.houseNo,
          zone: dto.zone,
          latitude: dto.latitude,
          longitude: dto.longitude,
          ownerUserId: dto.ownerUserId,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          "A house with this house number already exists in this village",
        );
      }
      throw err;
    }
  }
}
