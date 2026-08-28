import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { getSession } from '../lib/auth';

/**
 * Route guard mirroring the backend's JwtAuthGuard (see
 * apps/backend/src/common/guards/jwt-auth.guard.ts). This is a UX
 * convenience only — it stops an unauthenticated admin from seeing a blank
 * page, it is NOT a security boundary (the backend must reject unauthorized
 * requests regardless of what this component does; see spec 3.4 RBAC).
 */
export function ProtectedRoute({ children }: { children: ReactElement }) {
  const session = getSession();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
