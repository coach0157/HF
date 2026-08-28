/**
 * Top-level switch: Auth stack vs. Resident tabs vs. Guard tabs, based on
 * `AuthContext`'s session (src/context/AuthContext.tsx). This is the one
 * place role-based routing happens — see docs/ARCHITECTURE.md's mobile
 * section for why this is one Expo app with role-based navigation instead
 * of two separate apps.
 *
 * Also the single place that owns `navigationRef` (Epic 11, ADR-006's
 * deep-link data schema) — the only component with both (a) a mounted
 * `NavigationContainer` to attach a ref to, and (b) `session.role` from
 * `useAuth()`, which is needed because the SAME `{type, id}` payload routes
 * to a different navigator tree depending on whether the signed-in user is
 * a resident or a guard (e.g. "chat" opens inside `ResidentApp`'s Chat tab
 * or `GuardApp`'s Chat tab — never both, only one tree is ever mounted).
 */
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import type { NotificationResponse } from "expo-notifications";
import { useAuth } from "../context/AuthContext";
import { AuthNavigator } from "./AuthNavigator";
import { ResidentTabNavigator } from "./ResidentTabNavigator";
import { GuardTabNavigator } from "./GuardTabNavigator";
import type { RootStackParamList } from "./types";
import type { PushDeepLinkData } from "../lib/push";

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Epic 11 (ADR-006's deep-link data schema) — routes a tapped push
 * notification to the matching screen. `role` decides which nested
 * navigator tree ("ResidentApp" vs "GuardApp") is currently mounted; a
 * `{type, id}` whose target screen doesn't exist for the current role
 * (e.g. an "entry"/"announcement" push, which the backend only ever
 * targets at residents — see entry-log.service.ts/announcement.service.ts
 * — arriving while a GUARD is signed in on the same physical device that
 * used to be logged in as a resident) is a silent no-op, never a crash.
 *
 * Nested `screen`/`params` navigation via a ref (rather than a `navigate()`
 * call from inside a screen component) is React Navigation's own
 * documented pattern for reaching a deeply-nested screen from outside the
 * component tree — the root param list (`RootStackParamList`) only types
 * `ResidentApp`/`GuardApp` as `undefined` (it doesn't know about the tabs
 * or stacks nested inside them), hence the `as never` casts below; this is
 * the same trade-off React Navigation's own deep-linking guides make.
 */
function navigateForPushData(
  data: PushDeepLinkData,
  role: "RESIDENT" | "GUARD" | undefined,
): void {
  if (!navigationRef.isReady()) return;

  switch (data.type) {
    case "entry":
      // Only residents are ever the recipient (host = pass.createdByUserId).
      if (role === "RESIDENT") {
        navigationRef.navigate("ResidentApp", {
          screen: "Home",
          params: { screen: "EntryHistory" },
        } as never);
      }
      return;

    case "sos":
      // Only on-duty guards are ever the recipient (routedToGuardUserIds).
      if (role === "GUARD") {
        navigationRef.navigate("GuardApp", { screen: "SosList" } as never);
      }
      return;

    case "announcement":
      // resolveRecipients() only ever targets RESIDENT-role users.
      if (role === "RESIDENT") {
        navigationRef.navigate("ResidentApp", {
          screen: "Announcements",
        } as never);
      }
      return;

    case "chat": {
      // Both roles participate in chat. `id` is the ChatRoom's own id
      // (ADR-006: never a ChatMessage id) — ChatRoomScreen re-fetches
      // history from `GET /chat-rooms/:id/messages` itself, so a
      // placeholder title here (rather than needing the sender's name/room
      // name, which the push payload deliberately doesn't carry) is fine.
      const target = role === "RESIDENT" ? "ResidentApp" : role === "GUARD" ? "GuardApp" : undefined;
      if (!target) return;
      navigationRef.navigate(target, {
        screen: "Chat",
        params: {
          screen: "ChatRoom",
          params: { chatRoomId: data.id, title: "แชท" },
        },
      } as never);
      return;
    }
  }
}

function isPushDeepLinkData(value: unknown): value is PushDeepLinkData {
  const types = ["entry", "sos", "announcement", "chat"];
  return (
    !!value &&
    typeof value === "object" &&
    types.includes((value as { type?: unknown }).type as string) &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

export function RootNavigator() {
  const { session, loading } = useAuth();

  // The notification listener effect below is set up once (empty dep
  // array) — a ref keeps it reading the CURRENT role rather than whatever
  // role was signed in when the listener was first attached.
  const roleRef = useRef(session?.role);
  useEffect(() => {
    roleRef.current = session?.role;
  }, [session?.role]);

  // A deep link that arrives before NavigationContainer is ready (e.g. a
  // cold start where the JS bundle is still initializing) is queued here
  // and flushed from `onReady` below, instead of being silently dropped.
  const pendingDeepLinkRef = useRef<PushDeepLinkData | null>(null);
  const handledNotificationIds = useRef<Set<string>>(new Set());

  function handleResponse(response: NotificationResponse | null | undefined) {
    if (!response) return;
    // `getLastNotificationResponseAsync()` (cold start) and
    // `addNotificationResponseReceivedListener` (warm/background) can both
    // fire for the SAME tap on some platform/SDK combinations — dedupe by
    // the notification's own request identifier so a cold-start tap never
    // navigates twice.
    const id = response.notification.request.identifier;
    if (handledNotificationIds.current.has(id)) return;
    handledNotificationIds.current.add(id);

    const data = response.notification.request.content.data;
    if (!isPushDeepLinkData(data)) return;

    if (navigationRef.isReady()) {
      navigateForPushData(data, roleRef.current);
    } else {
      pendingDeepLinkRef.current = data;
    }
  }

  useEffect(() => {
    // Cold start — app was launched (from killed) by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then(handleResponse);

    // Warm/background — app already running, notification tapped.
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, []);

  if (loading) {
    // Restoring a persisted session from SecureStore (AuthContext's mount
    // effect) — avoid flashing the login screen before that resolves.
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        if (pendingDeepLinkRef.current) {
          const data = pendingDeepLinkRef.current;
          pendingDeepLinkRef.current = null;
          navigateForPushData(data, roleRef.current);
        }
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : session.role === "RESIDENT" ? (
          <Stack.Screen name="ResidentApp" component={ResidentTabNavigator} />
        ) : (
          <Stack.Screen name="GuardApp" component={GuardTabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
