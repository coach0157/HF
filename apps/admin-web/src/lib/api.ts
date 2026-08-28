/**
 * Minimal fetch wrapper for calling the backend API
 * (apps/backend, see docs/ARCHITECTURE.md for the full endpoint list).
 *
 * Dev agent TODO:
 *  - Attach the stored JWT as `Authorization: Bearer <token>` once
 *    src/lib/auth.ts actually stores one (login page currently a stub).
 *  - Handle 401 -> redirect to /login, and refresh-token rotation via
 *    `POST /auth/refresh`.
 *  - Consider swapping for a typed client generated from the backend's
 *    OpenAPI/Swagger doc (served at /docs by apps/backend) once the API
 *    stabilizes, instead of hand-writing fetch calls per page.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
