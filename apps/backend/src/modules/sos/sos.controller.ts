import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SosStatus } from '@prisma/client';
import { SosService } from './sos.service';
import { CreateSosAlertDto } from './dto/create-sos-alert.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { TenantClaims } from '../../common/rls/tenant-context';
import { perUserThrottle } from '../../common/throttle/per-user-throttle';

@Controller('sos-alerts')
export class SosController {
  constructor(private readonly sosService: SosService) {}

  @Roles('RESIDENT')
  // Spec 3.4: rate-limited but must NEVER delay/block a real emergency. A
  // generous per-account burst allowance (5 per 30s), not a blanket
  // endpoint-wide throttle — stops literal button-mash spam without ever
  // rejecting a legitimate distinct trigger.
  @Throttle(perUserThrottle(5, 30_000))
  @Post()
  trigger(@Body() dto: CreateSosAlertDto, @CurrentUser() user: TenantClaims) {
    return this.sosService.trigger(dto, user);
  }

  @Roles('GUARD')
  @Patch(':id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser() user: TenantClaims) {
    return this.sosService.acknowledge(id, user);
  }

  @Roles('GUARD')
  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() user: TenantClaims) {
    return this.sosService.resolve(id, user);
  }

  // Admin dashboard SOS view (backlog Epic 5) + guard's own incoming list.
  @Roles('ADMIN', 'GUARD')
  @Get()
  list(@Query('status') status?: SosStatus) {
    return this.sosService.list({ status });
  }
}
