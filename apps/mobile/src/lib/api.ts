/**
 * Fetch wrapper for calling the backend API — mobile equivalent of
 * apps/admin-web/src/lib/api.ts (same retry-on-401 + refresh-token-rotation
 * behavior, same NestJS validation-pipe error-message unwrapping).
 *
 * Differences from admin-web, both forced by `lib/auth.ts` being async
 * (SecureStore) instead of sync (localStorage):
 *  - Every session read is `await`ed.
 *  - There is no `window.location.href` to redirect to a login route on an
 *    unrecoverable 401. Instead this module exposes `onSessionExpired`, a
 *    single settable callback — `AuthContext` (src/context/AuthContext.tsx)
 *    registers itself here on mount so it can flip its in-memory session
 *    state to null, which `RootNavigator` reacts to by swapping in
 *    `AuthNavigator`. Dev agent TODO: wire that registration in
 *    AuthContext.tsx (stubbed there with a matching TODO).
 */
import { clearSession, getSession, updateTokens } from "./auth";
import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(fn: (() => void) | null): void {
  onSessionExpired = fn;
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === "string") return msg;
    if (Array.isArray(msg)) return msg.join("; ");
  }
  return fallback;
}

async function refreshTokens(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    await updateTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  _retried = false,
): Promise<T> {
  const session = await getSession();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401 && session && !_retried && path !== "/auth/refresh") {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return apiFetch<T>(path, init, true);
    }
    await clearSession();
    onSessionExpired?.();
    throw new ApiError(401, "Session expired — please log in again");
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(
      res.status,
      extractMessage(body, `API request failed: ${res.status} ${res.statusText}`),
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
