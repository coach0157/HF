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
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getSession, type MobileSession } from "../lib/auth";
import { setOnSessionExpired } from "../lib/api";
import { registerForPushNotificationsAsync } from "../lib/push";

interface AuthContextValue {
  session: MobileSession | null;
  loading: boolean;
  setSession: (session: MobileSession | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<MobileSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Epic 11 (ADR-006): registers this device's Expo push token with the
  // backend right after a session becomes available — both the
  // restore-on-relaunch path (below) and the fresh-login path (`setSession`
  // itself). Fire-and-forget (`void`, not awaited) — see lib/push.ts's doc
  // comment for why this never blocks/fails login or session restore.
  const setSession = useCallback((next: MobileSession | null) => {
    setSessionState(next);
    if (next) {
      void registerForPushNotificationsAsync();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((restored) => {
        if (!cancelled) {
          setSessionState(restored);
          if (restored) {
            void registerForPushNotificationsAsync();
          }
        }
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
    () => ({ session, loading, setSession }),
    [session, loading, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
