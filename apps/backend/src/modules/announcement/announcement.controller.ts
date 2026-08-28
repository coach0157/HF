import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { TenantClaims } from '../../common/rls/tenant-context';

@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: TenantClaims) {
    return this.announcementService.create(dto, user);
  }

  // No @Roles() — every authenticated role (resident/guard/admin) can read
  // the feed; scope filtering happens per-caller inside the service.
  @Get()
  list(@CurrentUser() user: TenantClaims) {
    return this.announcementService.list(user);
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: TenantClaims) {
    return this.announcementService.markRead(id, user);
  }
}
