import { Module } from "@nestjs/common";
import { OtpModule } from "../../common/otp/otp.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * Epic 1 — Auth (phone + OTP, JWT). See MVP_BACKLOG.md Epic 1 and spec
 * 3.3/3.4. Implementation lives in auth.service.ts / users.service.ts; see
 * their doc comments for the RLS-bootstrap details (why login/refresh use
 * PrismaService directly instead of getTenantPrismaClient()).
 */
@Module({
  imports: [OtpModule],
  controllers: [AuthController, UsersController],
  providers: [AuthService, UsersService],
})
export class AuthModule {}
