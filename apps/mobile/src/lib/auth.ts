/**
 * Auth session storage — mobile equivalent of apps/admin-web/src/lib/auth.ts,
 * populated from the real `POST /auth/login` response
 * (apps/backend/src/modules/auth/auth.service.ts's issueTokenPair()).
 *
 * Difference from admin-web (deliberate, per the task brief): tokens live in
 * `expo-secure-store` (iOS Keychain / Android Keystore-backed), not
 * localStorage — a phone is a much easier device to lose/have taken than an
 * office workstation, so the refresh token (30-day lifetime per
 * apps/backend/.env.example's JWT_REFRESH_EXPIRES_IN) needs OS-level
 * encryption at rest. SecureStore's API is async (unlike localStorage), so
 * every function here is async — screens must `await` session reads, not
 * read synchronously during render.
 *
 * `role` is 'RESIDENT' | 'GUARD' only — this app never logs in an ADMIN
 * (that's apps/admin-web's job). Dev agent TODO: reject an ADMIN-role login
 * response at the login screen the same way admin-web's LoginPage rejects
 * non-ADMIN roles, just inverted.
 */
import * as SecureStore from "expo-secure-store";

export interface MobileSession {
  accessToken: string;
  refreshToken: string;
  role: "RESIDENT" | "GUARD";
  villageId: string;
  userId: string;
  houseId: string | null;
  name: string;
  phone: string;
}

const STORAGE_KEY = "village_mobile_session";

export async function getSession(): Promise<MobileSession | null> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MobileSession;
  } catch {
    return null;
  }
}

export async function setSession(session: MobileSession): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
}

export async function updateTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await setSession({ ...session, accessToken, refreshToken });
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
