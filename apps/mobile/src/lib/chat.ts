/**
 * Socket.io client wiring for Epic 8 — Chat — mobile equivalent of
 * apps/admin-web/src/lib/chat.ts (same ADR-004/005 reasoning, see that
 * file's doc comment for the full write-up on why `auth` is a function and
 * why refresh-before-reconnect matters).
 *
 * Difference from admin-web, same reason as `lib/auth.ts`/`lib/api.ts`
 * being async here (SecureStore instead of localStorage): `getSession()` is
 * a Promise, so the `auth` callback below is async too — `socket.io-client`
 * supports an async `auth` function on React Native the same way it does on
 * web (per AGENTS.md: re-verify against the exact Expo/RN version's docs if
 * this ever misbehaves, but `socket.io-client` is a plain JS/WebSocket
 * client, not an Expo-specific API, so it isn't one of the APIs that tends
 * to move across Expo SDKs).
 */
import { io, type Socket } from "socket.io-client";
import { clearSession, getSession, updateTokens } from "./auth";
import { API_BASE_URL } from "./config";
import { onSessionExpired } from "./api";

let socket: Socket | null = null;
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    await updateTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

function refreshBeforeReconnect(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Shared chat Socket.io client singleton — see admin-web's lib/chat.ts for the full design rationale. */
export function getChatSocket(): Socket {
  if (socket) return socket;

  socket = io(API_BASE_URL, {
    autoConnect: false,
    transports: ["websocket"],
    auth: async (cb: (data: { token?: string }) => void) => {
      const session = await getSession();
      cb({ token: session?.accessToken });
    },
  });

  socket.on("connect_error", async () => {
    const refreshed = await refreshBeforeReconnect();
    if (!refreshed) {
      await clearSession();
      // Mirrors lib/api.ts's REST 401 handling — AuthContext listens for
      // this to flip RootNavigator back to the Auth stack.
      onSessionExpired?.();
    }
  });

  return socket;
}

export function disconnectChatSocket(): void {
  socket?.disconnect();
}
