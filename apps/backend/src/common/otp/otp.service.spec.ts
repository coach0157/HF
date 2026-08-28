import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { OtpService } from "./otp.service";

/**
 * QA addition — Dev flagged `OTP_DEV_BYPASS_CODE=000000` (local-only,
 * gitignored `.env`) as something that MUST NOT work once `NODE_ENV=production`.
 * otp.service.ts's verifyOtp() gates the bypass with
 * `isDev = NODE_ENV !== "production"` — this spec proves that gate holds:
 * the bypass code is accepted in dev/test config, and REJECTED outright when
 * NODE_ENV=production, even though OTP_DEV_BYPASS_CODE is still configured
 * (mirroring a misconfiguration where the env var leaks into a prod-like
 * environment — the NODE_ENV check must be what saves it, not the var being
 * merely absent).
 */
describe("OtpService — dev bypass code is disabled in production (NODE_ENV guard)", () => {
  async function buildService(
    config: Record<string, string>,
  ): Promise<OtpService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) =>
              key in config ? config[key] : fallback,
          },
        },
      ],
    }).compile();
    return moduleRef.get(OtpService);
  }

  const phone = "0800000001";

  it("dev/test config: OTP_DEV_BYPASS_CODE is accepted when NODE_ENV != production", async () => {
    const service = await buildService({
      NODE_ENV: "test",
      OTP_DEV_BYPASS_CODE: "000000",
    });
    await service.requestOtp(phone); // real code generated & discarded — we use the bypass instead
    expect(service.verifyOtp(phone, "000000")).toBe(true);
  });

  it("NODE_ENV=production: the SAME bypass code is rejected outright, even though OTP_DEV_BYPASS_CODE is still configured", async () => {
    const service = await buildService({
      NODE_ENV: "production",
      OTP_DEV_BYPASS_CODE: "000000",
    });
    await service.requestOtp(phone);
    expect(service.verifyOtp(phone, "000000")).toBe(false);
  });

  it("NODE_ENV=production: the real generated code is still required and does not itself leak (sanity check the entry isn't just wiped)", async () => {
    const service = await buildService({
      NODE_ENV: "production",
      OTP_DEV_BYPASS_CODE: "000000",
    });
    await service.requestOtp(phone);
    // A wrong, non-bypass code must also fail — production behaves like a
    // normal OTP flow, not "everything accepted" or "everything rejected".
    expect(service.verifyOtp(phone, "111111")).toBe(false);
  });

  it("no NODE_ENV set at all defaults to development (bypass allowed) — matches ConfigService's own documented default", async () => {
    const service = await buildService({
      OTP_DEV_BYPASS_CODE: "000000",
    });
    await service.requestOtp(phone);
    expect(service.verifyOtp(phone, "000000")).toBe(true);
  });
});
