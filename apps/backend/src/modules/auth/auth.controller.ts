import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RequestOtpDto } from "./dto/request-otp.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { Public } from "../../common/decorators/public.decorator";

/**
 * `POST /auth/login` in spec 3.3 is documented as a single "phone + OTP"
 * call, which in practice needs a request-OTP step first — split into
 * `POST /auth/otp/request` + `POST /auth/login` here (both @Public(), spec
 * 3.3's "ทุก endpoint ยกเว้น /auth/*"). `POST /auth/refresh` matches spec
 * 3.3 exactly. `POST /auth/logout` is a Dev-agent addition needed to
 * actually fulfil the backlog's "revoke เมื่อ logout" — it requires a valid
 * access token (not @Public()) since only an authenticated caller should be
 * able to revoke a refresh token.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Tighter than CommonModule's app-wide default (120 req/min) — OTP
  // request is the classic SMS-pumping abuse target (spec 3.4's rate-limit
  // concern extends here even though it's written explicitly only for SOS).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("otp/request")
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestOtp(@Body() dto: RequestOtpDto): Promise<void> {
    await this.authService.requestOtp(dto.phone);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.phone, dto.otp, dto.villageId);
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }
}
