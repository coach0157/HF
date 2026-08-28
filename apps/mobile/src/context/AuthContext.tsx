/**
 * App-wide auth/session state. `RootNavigator` (src/navigation/RootNavigator.tsx)
 * reads `session` from this context to decide Auth stack vs. Resident tabs vs.
 * Guard tabs — the mobile equivalent of admin-web's `ProtectedRoute`
 * (apps/admin-web/src/routes/ProtectedRoute.tsx), except here it picks
 * between three destinations instead of two since one app codebase serves
 * both roles (see docs/ARCHITECTURE.md's mobile section for why one app).
 *
 * Dev agent TODO:
 *  - On mount, call `getSession()` (src/lib/auth.ts) to restore a
 *    previously-stored session instead of always starting logged out.
 *  - Call `setOnSessionExpired(...)` (src/lib/api.ts) once, on mount, so an
 *    unrecoverable 401 anywhere in the app clears `session` here too — see
 *    api.ts's doc comment for why this indirection exists (no
 *    `window.location` on native).
 *  - Implement `login`/`logout` to actually call the auth endpoints
 *    (`POST /auth/otp/request`, `POST /auth/login`, `POST /auth/logout`)
 *    and persist via `setSession`/`clearSession`.
 */
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MobileSession } from "../lib/auth";

interface AuthContextValue {
  session: MobileSession | null;
  loading: boolean;
  setSession: (session: MobileSession | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<MobileSession | null>(null);
  // TODO(dev agent): true until the mount-time getSession() restore above is
  // implemented, then flip to false once that resolves either way.
  const [loading] = useState(false);

  const value = useMemo(
    () => ({ session, loading, setSession: setSessionState }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
