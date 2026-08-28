import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
}

/**
 * Epic 1: "OTP service: ส่ง OTP ผ่าน SMS provider (mock/stub สำหรับ dev env)".
 *
 * In-memory store, deliberately simple for MVP/dev: single-instance only,
 * lost on process restart. That's an acceptable trade-off for a 6-8 week MVP
 * (spec §4) but is a real limitation for a horizontally-scaled deployment —
 * swap for Redis (with the same TTL semantics) before staging if the backend
 * ever runs more than one instance. Flagged here rather than silently
 * shipped as if it were production-grade.
 *
 * OTP_PROVIDER=mock (see .env.example) logs the code via Logger instead of
 * calling a real SMS gateway — good enough for local dev/manual QA. Wiring
 * a real provider (e.g. Twilio, Thai SMS gateways) is a follow-up, isolated
 * to `sendViaProvider()` below.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly store = new Map<string, OtpEntry>();
  private readonly ttlMs: number;
  private readonly maxAttempts = 5;

  constructor(private readonly config: ConfigService) {
    this.ttlMs = Number(this.config.get<string>('OTP_TTL_SECONDS', '300')) * 1000;
  }

  async requestOtp(phone: string): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.store.set(phone, { code, expiresAt: Date.now() + this.ttlMs, attempts: 0, consumed: false });
    await this.sendViaProvider(phone, code);
  }

  /**
   * Verifies + consumes (single-use) an OTP for `phone`. Returns false on
   * any of: no OTP requested, expired, already used, too many attempts, or
   * wrong code — deliberately the same failure shape for all of these so
   * callers can't distinguish "wrong code" from "expired" (avoids leaking
   * timing/enumeration info), matching the backlog's "OTP expiry/reuse
   * ถูกปฏิเสธ" unit-test requirement.
   */
  verifyOtp(phone: string, code: string): boolean {
    const entry = this.store.get(phone);
    if (!entry || entry.consumed) return false;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(phone);
      return false;
    }

    entry.attempts += 1;
    if (entry.attempts > this.maxAttempts) {
      this.store.delete(phone);
      return false;
    }

    const devBypass = this.config.get<string>('OTP_DEV_BYPASS_CODE');
    const isDev = this.config.get<string>('NODE_ENV', 'development') !== 'production';
    const matches = entry.code === code || (isDev && devBypass && code === devBypass);
    if (!matches) return false;

    entry.consumed = true;
    this.store.delete(phone);
    return true;
  }

  private async sendViaProvider(phone: string, code: string): Promise<void> {
    const provider = this.config.get<string>('OTP_PROVIDER', 'mock');
    if (provider === 'mock') {
      // eslint-disable-next-line no-console
      this.logger.log(`[mock OTP] phone=${phone} code=${code} (dev only — never do this in prod)`);
      return;
    }
    // TODO(Dev agent / future): wire a real SMS gateway here (spec 3.1
    // doesn't mandate a specific vendor for MVP). Throwing rather than
    // silently no-op'ing so a misconfigured OTP_PROVIDER fails loudly.
    throw new Error(`Unsupported OTP_PROVIDER "${provider}" — only "mock" is implemented`);
  }
}
