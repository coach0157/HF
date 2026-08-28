/**
 * App-wide auth/session state. `RootNavigator` (src/navigation/RootNavigator.tsx)
 * reads `session` from this context to decide Auth stack vs. Resident tabs vs.
 * Guard tabs — the mobile equivalent of admin-web's `ProtectedRoute`
 * (apps/admin-web/src/routes/ProtectedRoute.tsx), except here it picks
 * between three destinations instead of two since one app codebase serves
 * both roles (see docs/ARCHITECTURE.md's mobile section for why one app).
 *
 * On mount: restore a previously-stored session from SecureStore
 * (src/lib/auth.ts's getSession()) so a relaunch doesn't force a re-login,
 * and register an `onSessionExpired` callback with `lib/api.ts` so an
 * unrecoverable 401 anywhere in the app (refresh token rotation failed)
 * clears `session` here too, which flips RootNavigator back to the Auth
 * stack.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getSession, type MobileSession } from "../lib/auth";
import { setOnSessionExpired } from "../lib/api";

interface AuthContextValue {
  session: MobileSession | null;
  loading: boolean;
  setSession: (session: MobileSession | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<MobileSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((restored) => {
        if (!cancelled) setSessionState(restored);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    setOnSessionExpired(() => setSessionState(null));
    return () => {
      cancelled = true;
      setOnSessionExpired(null);
    };
  }, []);

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
