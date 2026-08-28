import { ConflictException, Injectable, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { PrismaClient, User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OtpService } from '../../common/otp/otp.service';
import { getTenantPrismaClient } from '../../common/rls/tenant-context';

interface RefreshPayload {
  sub: string;
  villageId: string;
  role: User['role'];
  houseId: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Epic 1 — Auth (phone + OTP, JWT). See auth.module.ts's original TODO for
 * the constraints this implementation follows:
 *  - users.phone is unique only PER VILLAGE, so login must resolve
 *    village_id before any RLS-scoped query is possible.
 *  - Access tokens reuse the globally-registered JwtService (JWT_ACCESS_SECRET,
 *    configured in CommonModule). Refresh tokens use a SEPARATE secret
 *    (JWT_REFRESH_SECRET) via a manually-instantiated JwtService, and are
 *    persisted (hashed) in `refresh_tokens` so they can actually be revoked
 *    server-side before their natural expiry (rotation + logout).
 *
 * IMPORTANT correction vs. the original TODO's assumption ("this endpoint's
 * initial user lookup necessarily goes through PrismaService directly
 * (bypassing the tenant-scoped client)"): injecting PrismaService directly
 * does NOT bypass RLS. `village_app`'s tables have `FORCE ROW LEVEL
 * SECURITY` (rls-policies.sql), which applies to every session on that role
 * regardless of whether the query runs inside a transaction or which Prisma
 * client object issues it — with no `app.current_village_id` set, a plain
 * `prisma.user.findMany({ where: { phone } })` returns ZERO rows for every
 * village, not "all villages" (verified empirically while implementing
 * this). The only way to genuinely cross villages is a distinct BYPASSRLS
 * database role — see `authLookupPrisma` below and
 * infra/postgres/init/01-init.sql for the minimal-privilege role it connects
 * as (SELECT on exactly the columns login needs, nothing else, no writes).
 * Every other write in this service (issuing the first refresh token,
 * rotating on /refresh) goes through the normal `village_app` role via
 * `withVillageContext()` (SET LOCAL) once village_id is known — mirrors
 * prisma/seed.ts's pattern for the same underlying reason.
 */
@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly refreshJwt: JwtService;
  /**
   * Connects as `village_app_auth_lookup` (BYPASSRLS, column-restricted —
   * see infra/postgres/init/01-init.sql), used ONLY for the initial
   * phone -> candidate-users lookup in login(). Every other query in this
   * service uses `withVillageContext()` (the normal `village_app` role)
   * once village_id is known.
   */
  private readonly authLookupPrisma: PrismaClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly config: ConfigService,
  ) {
    this.refreshJwt = new JwtService({
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
    });
    this.authLookupPrisma = new PrismaClient({
      datasourceUrl: this.config.get<string>('AUTH_LOOKUP_DATABASE_URL'),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.authLookupPrisma.$disconnect();
  }

  async requestOtp(phone: string): Promise<void> {
    await this.otpService.requestOtp(phone);
  }

  async login(phone: string, otp: string, villageId?: string) {
    const otpOk = this.otpService.verifyOtp(phone, otp);
    if (!otpOk) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Uses authLookupPrisma (BYPASSRLS, column-restricted role), not
    // this.prisma / getTenantPrismaClient() — see the class doc comment for
    // why. `select` is required (not just an optimization): the DB role is
    // only GRANTed SELECT on these exact columns, so a default "select all
    // fields" query would fail with a permission error on password_hash etc.
    const candidates = await this.authLookupPrisma.user.findMany({
      where: { phone },
      select: { id: true, villageId: true, phone: true, role: true, houseId: true, name: true },
    });
    if (candidates.length === 0) {
      throw new UnauthorizedException('No account found for this phone number');
    }

    let user = candidates[0];
    if (candidates.length > 1) {
      const matched = villageId ? candidates.find((c) => c.villageId === villageId) : undefined;
      if (!matched) {
        const villages = await this.prisma.village.findMany({
          where: { id: { in: candidates.map((c) => c.villageId) } },
          select: { id: true, name: true },
        });
        throw new ConflictException({
          message:
            'This phone number is registered in more than one village. Retry POST /auth/login with a villageId from the list below.',
          villages,
        });
      }
      user = matched;
    }

    return this.issueTokenPair(user);
  }

  async refresh(oldRefreshToken: string) {
    let payload: RefreshPayload;
    try {
      payload = await this.refreshJwt.verifyAsync<RefreshPayload>(oldRefreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = hashToken(oldRefreshToken);
    const stored = await this.withVillageContext(payload.villageId, (tx) =>
      tx.refreshToken.findFirst({
        where: { tokenHash, villageId: payload.villageId, userId: payload.sub },
      }),
    );

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }

    // village_id is already known at this point (from the verified refresh
    // JWT payload), so this goes through the normal RLS-scoped path
    // (withVillageContext, the village_app role) — NOT authLookupPrisma,
    // which is reserved for the cross-tenant login lookup only.
    const user = await this.withVillageContext(payload.villageId, (tx) =>
      tx.user.findUnique({ where: { id: payload.sub } }),
    );
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    // Rotation: revoke the presented token before issuing a new pair, so a
    // captured-and-replayed old refresh token stops working immediately.
    await this.withVillageContext(payload.villageId, (tx) =>
      tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
    );

    return this.issueTokenPair(user);
  }

  /**
   * Only reachable on an authenticated request (see auth.controller.ts —
   * logout is NOT @Public()), so getTenantPrismaClient() is already
   * RLS-scoped to the caller's village here — no manual SET LOCAL needed.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const tx = getTenantPrismaClient<PrismaClient>();
    await tx.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    user: Pick<User, 'id' | 'villageId' | 'role' | 'houseId' | 'name' | 'phone'>,
  ) {
    const accessPayload = {
      sub: user.id,
      villageId: user.villageId,
      role: user.role,
      houseId: user.houseId,
    };
    const accessToken = await this.jwtService.signAsync(accessPayload);

    const refreshTtl = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');
    const refreshToken = await this.refreshJwt.signAsync(accessPayload, {
      expiresIn: refreshTtl as unknown as number,
    });
    const decoded = this.refreshJwt.decode<{ exp: number }>(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);

    await this.withVillageContext(user.villageId, (tx) =>
      tx.refreshToken.create({
        data: {
          villageId: user.villageId,
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt,
        },
      }),
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        villageId: user.villageId,
        houseId: user.houseId,
      },
    };
  }

  /**
   * Runs `fn` inside a short transaction with `app.current_village_id` SET
   * LOCAL, for paths that need to touch RLS-protected tables BEFORE a
   * request-scoped tenant context exists (login's first refresh-token
   * insert, /refresh's lookup+rotate). Mirrors prisma/seed.ts and
   * RlsInterceptor's own pattern — see docs/ARCHITECTURE.md §3.
   */
  private async withVillageContext<T>(
    villageId: string,
    fn: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_village_id', ${villageId}, true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }
}
