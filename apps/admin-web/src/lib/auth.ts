/**
 * Auth session storage. Populated from the real `POST /auth/login` response
 * (apps/backend/src/modules/auth/auth.service.ts's issueTokenPair()) after
 * this app rejects any non-ADMIN role at the login screen.
 *
 * Trade-off (documented, not accidental): both tokens live in
 * localStorage, not an httpOnly cookie. The backend issues plain bearer
 * tokens with no cookie support, and this is an internal admin tool (not
 * public-facing), so the simpler localStorage approach is acceptable for
 * MVP — but it is readable by any script on this origin (XSS exposure).
 * Revisit if this dashboard is ever exposed beyond a trusted internal
 * network.
 *
 * `role` must match apps/backend's TenantClaims['role']
 * ('RESIDENT' | 'GUARD' | 'ADMIN') so ProtectedRoute's checks line up with
 * backend RBAC (defense-in-depth only — the backend is the real authority,
 * see docs/ARCHITECTURE.md).
 */
export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  role: 'ADMIN';
  villageId: string;
  userId: string;
  name: string;
  phone: string;
}

const STORAGE_KEY = 'village_admin_session';

export function getSession(): AdminSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function setSession(session: AdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function updateTokens(accessToken: string, refreshToken: string): void {
  const session = getSession();
  if (!session) return;
  setSession({ ...session, accessToken, refreshToken });
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
