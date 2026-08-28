import { Module } from '@nestjs/common';

/**
 * Epic 1 — Auth (phone + OTP, JWT). See MVP_BACKLOG.md Epic 1 and spec 3.3/3.4.
 *
 * Dev agent TODO:
 *  - OtpService: request/verify OTP (mock SMS provider in dev — see
 *    OTP_PROVIDER env var), rate-limited per phone/IP.
 *  - AuthController: `POST /auth/login` (phone + OTP -> JWT with village_id,
 *    role, user_id, house_id), `POST /auth/refresh`. Both routes must be
 *    decorated `@Public()` (see src/common/decorators/public.decorator.ts) —
 *    they run before a JWT exists. NOTE: `users.phone` is unique only per
 *    village (see prisma/schema.prisma), so login-by-phone must resolve
 *    village_id BEFORE any RLS-scoped query is possible — this endpoint's
 *    initial user lookup necessarily goes through PrismaService directly
 *    (bypassing the tenant-scoped client), not getTenantPrismaClient(). If a
 *    phone number legitimately exists in more than one village, decide and
 *    implement a disambiguation step (not covered by the spec — flag to PM).
 *  - Refresh token storage + rotation + revoke-on-logout.
 *  - JWT signing here should reuse the JwtModule already registered
 *    globally in CommonModule (src/common/common.module.ts) — inject
 *    `JwtService` as usual.
 *  - RBAC guard/decorator infrastructure (JwtAuthGuard, RolesGuard,
 *    @Roles()) already exists in src/common/ — this module only needs to
 *    apply @Roles(...) on its own endpoints as needed and produce the JWT
 *    payload shape TenantContextMiddleware expects
 *    (src/common/rls/tenant-context.middleware.ts: sub, villageId, role,
 *    houseId).
 *  - Users CRUD (basic) for Admin Dashboard (Epic 5) to consume.
 */
@Module({})
export class AuthModule {}
