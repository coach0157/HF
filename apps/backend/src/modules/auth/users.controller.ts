import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { TenantClaims } from '../../common/rls/tenant-context';

/**
 * Epic 1 backlog item: basic Users CRUD backing Epic 5's Admin Dashboard
 * "จัดการสมาชิก" screen. Not explicitly in spec 3.3's endpoint list (that
 * section only lists Auth/Visitor Pass/Announcements/SOS/Chat/Maintenance/
 * Booking/Billing), but required by spec 1.3 + backlog Epic 5 acceptance
 * criteria ("เพิ่ม/ลบลูกบ้าน, ผูกบ้านเลขที่, จัดการสิทธิ์ รปภ.").
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: TenantClaims) {
    return user;
  }

  @Roles('ADMIN')
  @Get()
  list(@Query('role') role?: UserRole) {
    return this.usersService.list({ role });
  }

  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: TenantClaims) {
    return this.usersService.create(dto, user.villageId);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.usersService.remove(id);
  }
}
