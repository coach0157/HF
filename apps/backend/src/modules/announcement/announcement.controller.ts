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
} from "@nestjs/common";
import { AnnouncementService } from "./announcement.service";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateAnnouncementDto } from "./dto/update-announcement.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";

@Controller("announcements")
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Roles("ADMIN")
  @Post()
  create(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.announcementService.create(dto, user);
  }

  // No @Roles() — every authenticated role (resident/guard/admin) can read
  // the feed; scope filtering happens per-caller inside the service.
  @Get()
  list(@CurrentUser() user: TenantClaims) {
    return this.announcementService.list(user);
  }

  @Post(":id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.announcementService.markRead(id, user);
  }

  // Dev-agent addition: MVP_BACKLOG.md Epic 5 requires "แก้ไข/ลบ" (edit/
  // delete) on the Admin Dashboard's announcement screen, but spec 3.3's
  // literal endpoint list only names create/list/read-receipt. Added here,
  // admin-only, to unblock that P0 screen — see announcement.service.ts's
  // update()/remove() for the implementation.
  @Roles("ADMIN")
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: TenantClaims,
  ) {
    return this.announcementService.update(id, dto, user);
  }

  @Roles("ADMIN")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.announcementService.remove(id);
  }
}
