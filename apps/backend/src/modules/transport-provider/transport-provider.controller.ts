import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { TransportProviderType } from "@prisma/client";
import { TransportProviderService } from "./transport-provider.service";
import { CreateTransportProviderDto } from "./dto/create-transport-provider.dto";
import { UpdateTransportProviderDto } from "./dto/update-transport-provider.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";

/**
 * Epic 10 — Transport Directory (spec 2.7 / PHASE2_BACKLOG.md Epic 10).
 */
@Controller("transport-providers")
export class TransportProviderController {
  constructor(
    private readonly transportProviderService: TransportProviderService,
  ) {}

  @Roles("ADMIN")
  @Post()
  create(
    @Body() dto: CreateTransportProviderDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.transportProviderService.create(dto, user);
  }

  // No @Roles() — every authenticated role (resident/guard/admin) can read
  // the directory; visibility of inactive rows is scoped per-caller inside
  // the service, not by an RBAC role check.
  @Get()
  list(
    @CurrentUser() user: TenantClaims,
    @Query("active") active?: string,
    @Query("type") type?: TransportProviderType,
  ) {
    return this.transportProviderService.list(user, { active, type });
  }

  @Roles("ADMIN")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTransportProviderDto) {
    return this.transportProviderService.update(id, dto);
  }

  @Roles("ADMIN")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.transportProviderService.remove(id);
  }
}
