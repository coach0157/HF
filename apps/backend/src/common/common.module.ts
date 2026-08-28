import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RlsInterceptor } from './rls/rls.interceptor';
import { HealthController } from './health/health.controller';

/**
 * Cross-cutting infrastructure shared by every feature module:
 *  - PrismaModule (DB access)
 *  - JwtModule (used by TenantContextMiddleware to verify access tokens —
 *    NOT used to sign tokens; token issuing belongs to auth.module.ts)
 *  - Global guard order: JwtAuthGuard THEN RolesGuard (array order matters)
 *  - Global RlsInterceptor (see src/common/rls/rls.interceptor.ts)
 *  - A conservative default-wide rate limit (spec 3.4: "SOS/emergency
 *    endpoint ต้องมี rate-limit... แต่ไม่บล็อกจนทำให้เหตุฉุกเฉินจริงส่งไม่ทัน").
 *    This is a blunt, app-wide default only — Epic 2/4 need their OWN
 *    tighter, endpoint-specific limits (QR creation, manual entry, SOS
 *    trigger) implemented per-module with @Throttle() overrides; do not
 *    rely on this default alone for those.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        // `expiresIn` is typed by @nestjs/jwt as `number | StringValue` (a
        // template-literal type from the `ms` package, e.g. "15m"). An
        // env-driven string can't be narrowed to that type at compile time,
        // so we assert it here; the value itself is still validated at
        // runtime by `ms` when jsonwebtoken signs the token.
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as unknown as number,
        },
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RlsInterceptor },
  ],
})
export class CommonModule {}
