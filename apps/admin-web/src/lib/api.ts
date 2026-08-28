/**
 * Fetch wrapper for calling the backend API (apps/backend, see
 * docs/ARCHITECTURE.md for the full endpoint list / module boundaries).
 *
 * Responsibilities:
 *  - Attach the stored access token as `Authorization: Bearer <token>`.
 *  - On a 401, try `POST /auth/refresh` once (rotates the refresh token,
 *    see auth.service.ts) and retry the original request; if that also
 *    fails, clear the session and hard-redirect to /login.
 *  - Surface the backend's NestJS validation-pipe error shape
 *    (`{ message: string | string[], error, statusCode }`) as a readable
 *    Error message instead of a generic "API request failed".
 */
import { clearSession, getSession, updateTokens } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join('; ');
  }
  return fallback;
}

async function refreshTokens(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    updateTokens(data.accessToken, data.refreshToken);
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
  const session = getSession();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401 && session && !_retried && path !== '/auth/refresh') {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return apiFetch<T>(path, init, true);
    }
    clearSession();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Session expired — please log in again');
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(res.status, extractMessage(body, `API request failed: ${res.status} ${res.statusText}`));
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
