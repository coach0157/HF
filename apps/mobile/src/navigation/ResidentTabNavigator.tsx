/**
 * Resident bottom tabs (spec 1.1: "หน้าแรก | ประกาศ | แชท | เพิ่มเติม") — all
 * 4 tabs now present. "แชท" was dropped during the MVP round (Chat is Phase
 * 2, see docs/MVP_BACKLOG.md's "ไม่อยู่ใน scope" list) and is restored here
 * now that Epic 8 (docs/PHASE2_BACKLOG.md) is implemented. InviteGuest/
 * QrDisplay/EntryHistory are still reached from Home's shortcut cards
 * rather than being top-level tabs, matching the spec's wireframe (only
 * Home/Announcements/Chat/More are bottom-nav items, everything else is a
 * drill-in screen).
 *
 * Dev agent TODO: swap the plain Stack-of-screens-without-tab-icons below
 * for real `@react-navigation/bottom-tabs` `tabBarIcon`s once icon assets
 * are chosen (e.g. `@expo/vector-icons`, already bundled with Expo).
 */
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ResidentHomeScreen } from "../screens/resident/HomeScreen";
import { InviteGuestScreen } from "../screens/resident/InviteGuestScreen";
import { QrDisplayScreen } from "../screens/resident/QrDisplayScreen";
import { EntryHistoryScreen } from "../screens/resident/EntryHistoryScreen";
import { TransportScreen } from "../screens/resident/TransportScreen";
import { MaintenanceScreen } from "../screens/resident/MaintenanceScreen";
import { CreateMaintenanceScreen } from "../screens/resident/CreateMaintenanceScreen";
import { AnnouncementsScreen } from "../screens/resident/AnnouncementsScreen";
import { ChatListScreen } from "../screens/resident/ChatListScreen";
import { ChatRoomScreen } from "../screens/shared/ChatRoomScreen";
import { ProfileScreen } from "../screens/resident/ProfileScreen";
import type { ChatStackParamList, ResidentTabParamList } from "./types";
import { colors } from "../theme";

// Emoji tab icons — no @expo/vector-icons in this project's dependency
// tree (checked: not installed, not a transitive dep of the pinned `expo`
// version), and the app already uses emoji throughout (cards, buttons) as
// its icon language, so this stays consistent rather than adding a new
// package. Previously there was NO tabBarIcon at all, which is what showed
// as an empty/placeholder box in the tab bar on a real device.
function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

const HomeStack = createNativeStackNavigator<ResidentTabParamList>();
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
        name="Home"
        component={ResidentHomeScreen}
        // The screen renders its own top bar (village name + notification
        // bell) — showing the native stack header too stacked a second,
        // redundant bar on top of it ("หน้าแรก" title bar + the screen's own
        // "หมู่บ้าน" row underneath). Hidden here only; other screens in this
        // stack (InviteGuest, EntryHistory, ...) keep their native header.
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="InviteGuest"
        component={InviteGuestScreen}
        options={{ title: "เชิญแขก" }}
      />
      <HomeStack.Screen
        name="QrDisplay"
        component={QrDisplayScreen}
        options={{ title: "QR แขก" }}
      />
      <HomeStack.Screen
        name="EntryHistory"
        component={EntryHistoryScreen}
        options={{ title: "ประวัติเข้า-ออก" }}
      />
      <HomeStack.Screen
        name="Transport"
        component={TransportScreen}
        options={{ title: "เรียกรถโดยสาร" }}
      />
      <HomeStack.Screen
        name="Maintenance"
        component={MaintenanceScreen}
        options={{ title: "แจ้งซ่อม" }}
      />
      <HomeStack.Screen
        name="CreateMaintenance"
        component={CreateMaintenanceScreen}
        options={{ title: "แจ้งซ่อมใหม่" }}
      />
    </HomeStack.Navigator>
  );
}

// Epic 8 — Chat (spec 2.3 / docs/PHASE2_BACKLOG.md Epic 8). Spec 1.1's
// bottom nav is "หน้าแรก | ประกาศ | แชท | เพิ่มเติม" — the "แชท" tab was
// dropped during MVP (Phase 2 wasn't built yet, see the file-level comment
// this replaces) and is restored here now that Epic 8 exists. Nested stack
// so ChatListScreen can drill into the shared ChatRoomScreen, same pattern
// as HomeStackNavigator above.
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
function ChatStackNavigator() {
  return (
    <ChatStack.Navigator>
      <ChatStack.Screen name="ChatList" component={ChatListScreen} options={{ title: "แชท" }} />
      <ChatStack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ title: "" }} />
    </ChatStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<ResidentTabParamList>();

export function ResidentTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          headerShown: false,
          title: "หน้าแรก",
          tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} />,
        }}
      />
      <Tab.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{
          title: "ประกาศ",
          tabBarIcon: ({ color }) => <TabIcon emoji="📢" color={color} />,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatStackNavigator}
        options={{
          headerShown: false,
          title: "แชท",
          tabBarIcon: ({ color }) => <TabIcon emoji="💬" color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "เพิ่มเติม",
          tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
