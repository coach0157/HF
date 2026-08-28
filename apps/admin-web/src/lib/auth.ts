/**
 * Auth session storage stub. Dev agent TODO:
 *  - Populate this from the real `POST /auth/login` response (see
 *    apps/backend/src/modules/auth/auth.module.ts).
 *  - Store the access token in memory + refresh token in an httpOnly
 *    cookie if the backend is set up to issue one, or in localStorage as a
 *    fallback (document the trade-off — XSS exposure — wherever this is
 *    decided).
 *  - `role` here must match apps/backend's TenantClaims['role']
 *    ('RESIDENT' | 'GUARD' | 'ADMIN') so ProtectedRoute's checks line up
 *    with backend RBAC (defense-in-depth only — the backend is the real
 *    authority, see docs/ARCHITECTURE.md).
 */
export interface AdminSession {
  accessToken: string;
  role: 'ADMIN';
  villageId: string;
  userId: string;
}

const STORAGE_KEY = 'village_admin_session';

export function getSession(): AdminSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as AdminSession) : null;
}

export function setSession(session: AdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
