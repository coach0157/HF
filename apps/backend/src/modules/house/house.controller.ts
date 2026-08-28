import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { HouseService } from "./house.service";
import { CreateHouseDto } from "./dto/create-house.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";

/**
 * See house.module.ts / dto/create-house.dto.ts doc comments for why this
 * module exists (Dev-agent addition backing Admin Dashboard Epic 5 screens
 * that need to resolve/pick a house — members page's house assignment, SOS
 * dashboard's house number display).
 */
@Controller("houses")
export class HouseController {
  constructor(private readonly houseService: HouseService) {}

  @Roles("ADMIN", "GUARD")
  @Get()
  list(@Query("zone") zone?: string) {
    return this.houseService.list({ zone });
  }

  // Dev-agent addition (backend gap flagged in MVP_BACKLOG.md Epic 6): the
  // Resident app's ProfileScreen needs house_no/zone for the caller's own
  // house. RESIDENT added here, but NOT to the `list()` route above — a
  // resident must never browse other houses in the village, only fetch
  // their own by id (ownership enforced in the service).
  @Roles("ADMIN", "GUARD", "RESIDENT")
  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.houseService.findOne(id, user);
  }

  @Roles("ADMIN")
  @Post()
  create(@Body() dto: CreateHouseDto, @CurrentUser() user: TenantClaims) {
    return this.houseService.create(dto, user);
  }
}
