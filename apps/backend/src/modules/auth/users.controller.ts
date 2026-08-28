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
import { UserRole } from "@prisma/client";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { TenantClaims } from "../../common/rls/tenant-context";

/**
 * Epic 1 backlog item: basic Users CRUD backing Epic 5's Admin Dashboard
 * "จัดการสมาชิก" screen. Not explicitly in spec 3.3's endpoint list (that
 * section only lists Auth/Visitor Pass/Announcements/SOS/Chat/Maintenance/
 * Booking/Billing), but required by spec 1.3 + backlog Epic 5 acceptance
 * criteria ("เพิ่ม/ลบลูกบ้าน, ผูกบ้านเลขที่, จัดการสิทธิ์ รปภ.").
 */
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  me(@CurrentUser() user: TenantClaims) {
    return user;
  }

  // Epic 8 (Chat): opened to RESIDENT/GUARD so the mobile chat screen can
  // find an admin/guard to start a DIRECT chat with — see UsersService.list()'s
  // doc comment for why this does NOT reopen a resident directory (spec
  // 2.7's explicit "no resident directory" decision still holds: a
  // non-ADMIN caller only ever gets ADMIN/GUARD rows back, enforced in the
  // service, not just here).
  @Roles("ADMIN", "RESIDENT", "GUARD")
  @Get()
  list(@Query("role") role: UserRole | undefined, @CurrentUser() user: TenantClaims) {
    return this.usersService.list({ role }, user);
  }

  // Dev-agent addition (backend gap flagged in MVP_BACKLOG.md Epic 7): the
  // Guard app's SOS list needs the triggering resident's phone number for
  // the "โทรกลับ" callback button, and the Resident app's ProfileScreen
  // needs its own record. Ownership is enforced in the service, not just
  // here: RESIDENT may only fetch their own id (403 otherwise); GUARD may
  // fetch any user in the village (RLS already confines this to the same
  // village); ADMIN unrestricted, as before.
  @Roles("ADMIN", "GUARD", "RESIDENT")
  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: TenantClaims) {
    return this.usersService.findOne(id, user);
  }

  @Roles("ADMIN")
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: TenantClaims) {
    return this.usersService.create(dto, user.villageId);
  }

  @Roles("ADMIN")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Roles("ADMIN")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.usersService.remove(id);
  }
}
