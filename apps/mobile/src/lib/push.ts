/**
 * Epic 11 — Push Notifications (docs/ARCHITECTURE.md ADR-006,
 * docs/PHASE2_BACKLOG.md Epic 11's "Implementation Tasks — mobile"):
 * requests permission, obtains an Expo push token, and registers/
 * unregisters it with the backend (`POST` / `DELETE /push-tokens`, see
 * apps/backend/src/common/push/push.controller.ts).
 *
 * API checked against the exact SDK 57 docs per AGENTS.md ("Expo HAS
 * CHANGED — read the exact versioned docs before writing any code"):
 * https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ — notably:
 *  - `shouldShowAlert` is deprecated; the foreground handler now returns
 *    `shouldShowBanner`/`shouldShowList` instead.
 *  - `getExpoPushTokenAsync()` requires an explicit `projectId` (no longer
 *    inferred), read from `Constants.expoConfig?.extra?.eas?.projectId`.
 *  - An Android notification channel must be created BEFORE requesting a
 *    push token (required since Android 13).
 *
 * Dev-agent decision beyond what any doc/backlog spells out for this repo
 * specifically: `app.json` has no `extra.eas.projectId` yet (no `eas init`
 * has been run against this project as of this Epic 11 round — see
 * app.json). Every function here is written to fail SOFT (log + return)
 * when that's missing, rather than throw, so the rest of the app (login,
 * session restore, logout) never breaks because push isn't fully
 * provisioned yet. Once a real EAS project is created, this starts working
 * with zero code changes here.
 *
 * Also fails soft on Android under Expo Go: Expo removed remote push
 * support from Expo Go on Android starting SDK 52 (a development/EAS build
 * is required there — see
 * https://expo.dev/changelog/sdk-53#expo-notifications-changes and
 * apps/mobile/AGENTS.md's instruction to verify against current docs, not
 * memory). Still works in Expo Go on iOS. `registerForPushNotificationsAsync`
 * simply catches whatever `getExpoPushTokenAsync` throws in that
 * environment and no-ops — there is no reliable static "is this Expo Go on
 * Android" check worth hard-coding here, and ADR-006 already treats push as
 * best-effort, never something the rest of the app depends on.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";

export type PushDeepLinkType = "entry" | "sos" | "announcement" | "chat";

/** Mirrors apps/backend's `PushDeepLinkData` (ADR-006) exactly. */
export interface PushDeepLinkData {
  type: PushDeepLinkType;
  id: string;
}

// Foreground notification handler — set once at module load, before any
// notification could plausibly arrive (Expo's own recommended pattern).
// `shouldShowBanner`/`shouldShowList` show the OS banner/notification-center
// entry even while the app is in the foreground (background/killed-app
// delivery is handled by the OS regardless of this handler).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas
      ?.projectId ?? Constants.easConfig?.projectId
  );
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "การแจ้งเตือนทั่วไป",
    importance: Notifications.AndroidImportance.MAX,
  });
}

async function getExpoPushTokenSafe(): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulators/emulators cannot obtain a real push token.
    console.log("[push] skipped — push tokens require a physical device");
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.log(
      "[push] skipped — no EAS projectId configured in app.json (run `eas init`)",
    );
    return null;
  }

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") {
    console.log("[push] skipped — notification permission not granted");
    return null;
  }

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  return expoPushToken;
}

/**
 * Called from `AuthContext` right after a session becomes available (both
 * a fresh login and a restored session on app relaunch — see that file's
 * `useEffect`). Never throws — every failure mode (no device, no
 * permission, no EAS project, Expo Go on Android, network error hitting
 * `POST /push-tokens`) is caught and logged, never surfaced to the caller,
 * matching ADR-006's "push is best-effort, never something the app depends
 * on" principle applied to the mobile side too.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    const expoPushToken = await getExpoPushTokenSafe();
    if (!expoPushToken) return;
    await api.post("/push-tokens", { expoPushToken });
  } catch (err) {
    console.warn("[push] registerForPushNotificationsAsync failed:", err);
  }
}

/**
 * Called from the logout handler BEFORE the session is cleared (needs a
 * valid JWT to call `DELETE /push-tokens`) — see AuthContext-adjacent
 * logout code. Re-derives the same token `getExpoPushTokenAsync` would
 * have returned (Expo caches this locally; this does not re-prompt for
 * permission once already granted) rather than requiring callers to thread
 * the original token value through, since the token was never persisted to
 * SecureStore separately — deliberately not adding another piece of local
 * state to keep in sync when the backend is the source of truth for "which
 * tokens are registered."
 */
export async function unregisterPushTokenAsync(): Promise<void> {
  try {
    const expoPushToken = await getExpoPushTokenSafe();
    if (!expoPushToken) return;
    await api.delete("/push-tokens", { expoPushToken });
  } catch (err) {
    console.warn("[push] unregisterPushTokenAsync failed:", err);
  }
}
