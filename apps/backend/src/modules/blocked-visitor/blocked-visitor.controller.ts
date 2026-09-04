import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { BlockedVisitorService } from "./blocked-visitor.service";
import { CreateBlockedVisitorDto } from "./dto/create-blocked-visitor.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";

// User-requested add-on (docs/PHASE2_BACKLOG.md §6 (Epic 13)) — admin-only ban list.
@Controller("blocked-visitors")
export class BlockedVisitorController {
  constructor(private readonly blockedVisitorService: BlockedVisitorService) {}

  @Roles("ADMIN")
  @Post()
  create(
    @Body() dto: CreateBlockedVisitorDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.blockedVisitorService.create(dto, user);
  }

  @Roles("ADMIN")
  @Get()
  list() {
    return this.blockedVisitorService.list();
  }

  @Roles("ADMIN")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.blockedVisitorService.remove(id);
  }
}
