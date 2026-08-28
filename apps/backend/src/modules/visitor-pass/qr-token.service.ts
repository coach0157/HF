import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { VisitorPassUsageType } from "@prisma/client";

export interface QrTokenPayload {
  passId: string;
  villageId: string;
  usageType: VisitorPassUsageType;
}

/**
 * Visitor QR token: a signed JWT SEPARATE from the auth JWT, per
 * visitor-pass.module.ts's original TODO and spec 3.4 ("เข้ารหัส QR token
 * แบบ signed JWT ที่มีวันหมดอายุ"). Uses its own secret (QR_TOKEN_SECRET,
 * .env.example) via a manually-instantiated JwtService, never
 * JWT_ACCESS_SECRET — a leaked QR (handed to a visitor's phone/printed)
 * must not be usable as an API access token and vice versa.
 *
 * The JWT's own `exp` claim is set to `validTo` as a defense-in-depth
 * expiry check enforced by the JWT library itself; VisitorPassService still
 * separately checks `validFrom`/`validTo`/`status` against the DB row on
 * every scan, since revocation and `validFrom` (not-yet-valid) can't be
 * expressed by `exp` alone.
 */
@Injectable()
export class QrTokenService {
  private readonly jwt: JwtService;

  constructor(private readonly config: ConfigService) {
    this.jwt = new JwtService({
      secret: this.config.get<string>("QR_TOKEN_SECRET"),
    });
  }

  sign(payload: QrTokenPayload, validTo: Date): string {
    const secondsUntilExpiry = Math.max(
      1,
      Math.floor((validTo.getTime() - Date.now()) / 1000),
    );
    return this.jwt.sign(payload, { expiresIn: secondsUntilExpiry });
  }

  /** Throws if the token is malformed, wrongly signed, or past its `exp`. */
  verify(token: string): QrTokenPayload {
    return this.jwt.verify<QrTokenPayload>(token);
  }
}
