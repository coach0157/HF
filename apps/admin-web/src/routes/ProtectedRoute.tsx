import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { clearSession, getSession } from '../lib/auth';

/**
 * Route guard mirroring the backend's JwtAuthGuard + RolesGuard (see
 * apps/backend/src/common/guards/). This is a UX convenience only — it
 * stops an unauthenticated/non-admin visitor from seeing a blank or
 * partially-loaded page. It is NOT a security boundary: the backend
 * independently rejects unauthorized requests via @Roles('ADMIN') on every
 * admin-only endpoint regardless of what this component does (spec 3.4
 * RBAC). This app is admin-only by design (spec 1.3) — a RESIDENT/GUARD
 * session (which should never be created here, see LoginPage) is treated
 * the same as "not logged in".
 */
export function ProtectedRoute({ children }: { children: ReactElement }) {
  const session = getSession();

  if (!session || session.role !== 'ADMIN') {
    if (session) clearSession();
    return <Navigate to="/login" replace />;
  }

  return children;
}
