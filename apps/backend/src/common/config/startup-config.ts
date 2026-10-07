/**
 * Startup-time config checks run from main.ts (not ConfigModule's
 * `validate`, so e2e suites that flip NODE_ENV=production at runtime — e.g.
 * otp-prod-bypass.e2e-spec.ts — aren't blocked by the dev placeholder
 * secrets in .env). See docs/PRODUCTION_CHECKLIST.md 1.1 and 1.4.
 */

type Env = Record<string, string | undefined>;

// Admin-web's Vite dev server (apps/admin-web/vite.config.ts). The mobile
// app is native, so it sends no Origin header and is unaffected by CORS.
const DEV_CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

/**
 * Allowed browser origins for REST + Socket.IO. `CORS_ORIGINS` is a
 * comma-separated list; unset falls back to the local admin-web dev server,
 * except in production where it must be set explicitly.
 */
export function resolveCorsOrigins(env: Env = process.env): string[] {
  const raw = env.CORS_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "CORS_ORIGINS must be set in production (comma-separated admin-web origin(s), e.g. https://admin.example.com)",
    );
  }
  return DEV_CORS_ORIGINS;
}

const SIGNING_SECRETS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "QR_TOKEN_SECRET",
] as const;

const MIN_SECRET_LENGTH = 32;

/**
 * Refuses to boot in production with missing, placeholder ("change-me-*"),
 * short, or reused signing secrets — any of those lets an attacker forge
 * JWTs or visitor QR tokens.
 */
export function assertProductionSecrets(env: Env = process.env): void {
  if (env.NODE_ENV !== "production") return;

  const problems: string[] = [];
  for (const name of SIGNING_SECRETS) {
    const value = env[name];
    if (!value) problems.push(`${name} is not set`);
    else if (value.includes("change-me")) problems.push(`${name} is still the placeholder value`);
    else if (value.length < MIN_SECRET_LENGTH)
      problems.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`);
  }
  const values = SIGNING_SECRETS.map((name) => env[name]).filter(Boolean);
  if (new Set(values).size !== values.length) {
    problems.push(`${SIGNING_SECRETS.join("/")} must all be different`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start in production with unsafe secrets:\n- ${problems.join("\n- ")}\n` +
        `Generate each with: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`,
    );
  }
}
