/**
 * Backend API base URL.
 *
 * Mirrors admin-web's `VITE_API_BASE_URL` pattern (apps/admin-web/src/lib/api.ts)
 * but using Expo's build-time env convention: any env var prefixed
 * `EXPO_PUBLIC_` is inlined into the JS bundle at build time (see
 * https://docs.expo.dev/versions/v57.0.0/guides/environment-variables/ —
 * per AGENTS.md, re-check this link's exact API before relying on it, Expo
 * env handling has changed across SDKs before).
 *
 * Dev agent TODO: add a `.env` / `.env.example` (EXPO_PUBLIC_API_BASE_URL=...)
 * once there's a real staging URL to point at — same "never commit real
 * secrets" rule as apps/backend/.env.example.
 *
 * `10.0.2.2` is the Android emulator's alias for the host machine's
 * localhost; iOS simulator can use `localhost` directly. Physical devices
 * need the host machine's LAN IP — set EXPO_PUBLIC_API_BASE_URL for that
 * case, this hardcoded fallback is dev-emulator-only.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
