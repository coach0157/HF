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
 *
 * IMPORTANT correction found by QA against a real device: the above
 * "catches whatever throws" claim only holds for errors thrown from inside
 * a function call. On Expo Go/Android/SDK57, `expo-notifications` itself
 * throws as a SIDE EFFECT of merely being imported/required (its own
 * module-init code calls `addPushTokenListener` internally and that's what
 * warns/throws — see the `warnOfExpoGoPushUsage` frame in the crash's
 * stack). A static `import * as Notifications from "expo-notifications"`
 * at the top of this file runs that code the moment ANY file imports this
 * module (i.e. at app boot, via AuthContext), which crashes the whole app
 * before any of our try/catch blocks below ever get a chance to run.
 * Fixed by lazy-`require`-ing the module through `getNotifications()`
 * instead of a static import, so the failure happens inside a try/catch we
 * actually control, no earlier than the first time push is attempted (after
 * login) rather than at import time.
 */
import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { api } from "./api";

export type PushDeepLinkType = "entry" | "sos" | "announcement" | "chat";

/** Mirrors apps/backend's `PushDeepLinkData` (ADR-006) exactly. */
export interface PushDeepLinkData {
  type: PushDeepLinkType;
  id: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotificationsModule = typeof import("expo-notifications");

// `undefined` = never attempted yet, `null` = attempted and unavailable in
// this environment. Memoized so we only pay the (possibly-throwing) require
// once per app session, not on every push-related call.
let cached: NotificationsModule | null | undefined;

/**
 * Lazily (and safely) loads `expo-notifications`. Exported so
 * `RootNavigator.tsx` can share the exact same guarded load instead of
 * risking its own static import re-introducing the crash this fixes.
 * Returns `null` — never throws — when the module is unavailable (Expo Go
 * on Android/SDK53+, or any other future environment mismatch).
 */
export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-notifications") as NotificationsModule;
    // Foreground notification handler — set once, right after the first
    // successful load (equivalent to the old "at module load" timing, but
    // now only reachable once we know the module didn't throw).
    // `shouldShowBanner`/`shouldShowList` show the OS banner/notification-
    // center entry even while the app is in the foreground (background/
    // killed-app delivery is handled by the OS regardless of this handler).
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
  } catch (err) {
    console.warn("[push] expo-notifications unavailable in this environment:", err);
    cached = null;
  }
  return cached;
}

function getProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas
      ?.projectId ?? Constants.easConfig?.projectId
  );
}

async function ensureAndroidChannel(notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== "android") return;
  await notifications.setNotificationChannelAsync("default", {
    name: "การแจ้งเตือนทั่วไป",
    importance: notifications.AndroidImportance.MAX,
  });
}

async function getExpoPushTokenSafe(): Promise<string | null> {
  const notifications = getNotifications();
  if (!notifications) return null;

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

  await ensureAndroidChannel(notifications);

  const { status: existingStatus } = await notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const requested = await notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") {
    console.log("[push] skipped — notification permission not granted");
    return null;
  }

  const { data: expoPushToken } = await notifications.getExpoPushTokenAsync({
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
