/**
 * Socket.io client wiring for Epic 8 — Chat (docs/ARCHITECTURE.md ADR-004
 * "why Socket.io" + ADR-005 "WebSocket authentication & RLS scoping",
 * §8.2 point 1 + point 5).
 *
 * ADR-005 point 1: the access JWT is sent via Socket.io's `auth` handshake
 * field, never a header or query string. Here `auth` is passed as a
 * FUNCTION (`(cb) => cb({ token })`), not a plain object — Socket.io calls
 * that function fresh before EVERY (re)connection attempt, so a token
 * refreshed by `lib/api.ts`'s 401 handler (or by `refreshBeforeReconnect`
 * below) is picked up automatically the next time the socket connects,
 * without needing to manually tear down and recreate the `Socket` instance.
 *
 * ADR-005 point 5: "a proactively-expiring token needs the client to
 * refresh via POST /auth/refresh... before the reconnect attempt's
 * handshake, not after a failed one". A live connection keeps working past
 * its original JWT's expiry (the token is only checked once, at handshake
 * time — see the ADR), so there's no need to force-refresh a healthy
 * connection. The case that DOES need handling is: connection drops for any
 * reason (network blip, server restart, or an actually-expired token) and
 * Socket.io auto-reconnects — if the stored access token is already
 * expired at that point, refresh it FIRST so the reconnect's handshake
 * carries a valid one instead of failing and retrying indefinitely.
 */
import { io, type Socket } from 'socket.io-client';
import { clearSession, getSession, updateTokens } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = getSession();
  if (!session) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    updateTokens(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

/** De-dupes concurrent refresh calls (e.g. a reconnect storm) into one in-flight request. */
function refreshBeforeReconnect(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Returns the shared chat Socket.io client, creating (but not necessarily
 * yet connecting) it on first call. `ChatPage` calls `.connect()` on mount
 * and `.disconnect()` on unmount; the instance itself is a module-level
 * singleton so re-mounting the page doesn't leak connections.
 */
export function getChatSocket(): Socket {
  if (socket) return socket;

  socket = io(API_BASE_URL, {
    autoConnect: false,
    transports: ['websocket'],
    auth: (cb: (data: { token?: string }) => void) => {
      const session = getSession();
      cb({ token: session?.accessToken });
    },
  });

  // A connection failure at handshake time (invalid/expired token being the
  // most likely cause — see ADR-005 point 1: the gateway disconnects
  // immediately on a bad token, which surfaces here as `connect_error`)
  // triggers a refresh, then lets Socket.io's own reconnection logic retry
  // — the next attempt's `auth` callback above will read the refreshed
  // token from storage automatically.
  socket.on('connect_error', async () => {
    const refreshed = await refreshBeforeReconnect();
    if (!refreshed) {
      // Refresh token is also invalid/expired — same "session expired"
      // handling as lib/api.ts's REST 401 path.
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  });

  return socket;
}

export function disconnectChatSocket(): void {
  // Discard the singleton, not just disconnect it — see mobile's
  // lib/chat.ts (identical fix, identical reasoning) for the full write-up.
  // In short: socket.io-client's `disconnect()` never clears `sendBuffer`,
  // so any `emit()` queued while briefly offline could get flushed on the
  // NEXT `connect()` under whichever session logs in next on this device.
  // Dropping the instance guarantees a clean slate per login.
  socket?.disconnect();
  socket = null;
}
