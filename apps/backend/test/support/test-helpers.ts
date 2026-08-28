/**
 * Shared harness for the QA e2e suite (see docs/QA_REPORT.md).
 *
 * NOT itself a test file (no `.e2e-spec.ts` suffix, so jest-e2e.json's
 * testRegex ignores it) — imported by the actual spec files.
 *
 * Loads apps/backend/.env directly via dotenv BEFORE any @nestjs/* import
 * runs, because raw `new PrismaClient()` instances created here (bypassing
 * Nest's ConfigModule) need `process.env.DATABASE_URL` /
 * `AUTH_LOOKUP_DATABASE_URL` populated immediately, not lazily at Nest
 * bootstrap time.
 */
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Login flow in these tests uses the dev OTP bypass code (see
// common/otp/otp.service.ts: `isDev && devBypass && code === devBypass`) so
// tests never need to scrape the mock SMS log for the real 6-digit code.
// Must be set before AppModule/ConfigModule is compiled by any spec file.
process.env.OTP_DEV_BYPASS_CODE = "000000";
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}

import { PrismaClient, UserRole } from "@prisma/client";

export const rawPrisma = new PrismaClient();

/**
 * Mirrors RlsInterceptor / prisma/seed.ts's own pattern: opens a short
 * transaction, `SET LOCAL app.current_village_id`, runs `fn` inside it. Used
 * by test fixtures to seed data past the RLS `WITH CHECK` policy, and by
 * assertions that need to read back village-scoped rows directly (bypassing
 * the HTTP API) to verify server-side state (e.g. audit_logs rows).
 */
export async function withVillageContext<T>(
  villageId: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  return rawPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_village_id', ${villageId}, true)`;
    return fn(tx as unknown as PrismaClient);
  });
}

let phoneCounter = 1;
/** 10-digit Thai-format phone (matches every DTO's `/^0\d{9}$/`), unique per test process. */
export function nextPhone(prefix: string): string {
  const n = phoneCounter++;
  return `0${prefix}${String(n).padStart(7, "0")}`;
}

export interface Actor {
  id: string;
  phone: string;
  role: UserRole;
  houseId: string | null;
}

export interface VillageFixture {
  villageId: string;
  houseId: string;
  admin: Actor;
  resident: Actor;
  guardOnDuty: Actor;
  guardOffDuty: Actor;
}

/**
 * Creates a village + house + 4 users (admin/resident/2 guards) directly via
 * Prisma (mirrors prisma/seed.ts's pattern — there's no signup endpoint, and
 * the first admin in a real village would be provisioned out-of-band too).
 * `phonePrefix` should be a distinct 2-digit string per fixture to keep
 * phone numbers from colliding across villages within one test run.
 */
export async function createVillageFixture(
  label: string,
  phonePrefix: string,
): Promise<VillageFixture> {
  const village = await rawPrisma.village.create({
    data: { name: `QA Test Village ${label}`, status: "ACTIVE" },
  });

  return withVillageContext(village.id, async (tx) => {
    const house = await tx.house.create({
      data: { villageId: village.id, houseNo: `QA-${label}`, zone: "QA-ZONE" },
    });
    const admin = await tx.user.create({
      data: {
        villageId: village.id,
        name: `Admin ${label}`,
        phone: nextPhone(phonePrefix),
        role: "ADMIN",
      },
    });
    const resident = await tx.user.create({
      data: {
        villageId: village.id,
        name: `Resident ${label}`,
        phone: nextPhone(phonePrefix),
        role: "RESIDENT",
        houseId: house.id,
      },
    });
    const guardOnDuty = await tx.user.create({
      data: {
        villageId: village.id,
        name: `GuardOnDuty ${label}`,
        phone: nextPhone(phonePrefix),
        role: "GUARD",
      },
    });
    const guardOffDuty = await tx.user.create({
      data: {
        villageId: village.id,
        name: `GuardOffDuty ${label}`,
        phone: nextPhone(phonePrefix),
        role: "GUARD",
      },
    });

    return {
      villageId: village.id,
      houseId: house.id,
      admin: {
        id: admin.id,
        phone: admin.phone,
        role: admin.role,
        houseId: null,
      },
      resident: {
        id: resident.id,
        phone: resident.phone,
        role: resident.role,
        houseId: house.id,
      },
      guardOnDuty: {
        id: guardOnDuty.id,
        phone: guardOnDuty.phone,
        role: guardOnDuty.role,
        houseId: null,
      },
      guardOffDuty: {
        id: guardOffDuty.id,
        phone: guardOffDuty.phone,
        role: guardOffDuty.role,
        houseId: null,
      },
    };
  });
}

/** `villages` has no RLS policy (see rls-policies.sql) and every child FK cascades. */
export async function deleteVillage(villageId: string): Promise<void> {
  await rawPrisma.village
    .delete({ where: { id: villageId } })
    .catch(() => undefined);
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/** Minimal fetch-based HTTP client — avoids adding supertest as a new dependency. */
export async function api<T = any>(
  baseUrl: string,
  method: string,
  urlPath: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body: body as T };
}

/** Full OTP-request + login round trip using the dev bypass code. Returns the raw response (caller checks status). */
export async function loginAs(
  baseUrl: string,
  phone: string,
  villageId?: string,
): Promise<ApiResponse<any>> {
  await api(baseUrl, "POST", "/auth/otp/request", { body: { phone } });
  return api(baseUrl, "POST", "/auth/login", {
    body: { phone, otp: "000000", ...(villageId ? { villageId } : {}) },
  });
}

/** Convenience wrapper for tests that just need a bearer token and expect login to succeed. */
export async function loginToken(
  baseUrl: string,
  phone: string,
  villageId?: string,
): Promise<string> {
  const res = await loginAs(baseUrl, phone, villageId);
  if (res.status !== 201) {
    throw new Error(
      `login failed for phone=${phone}: HTTP ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.accessToken;
}

export function futureIso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}
export function pastIso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}
