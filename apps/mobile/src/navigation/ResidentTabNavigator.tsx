/**
 * Resident bottom tabs (spec 1.1: "หน้าแรก | ประกาศ | แชท | เพิ่มเติม").
 * "แชท" is dropped here — Chat is Phase 2 (out of MVP scope, see
 * docs/MVP_BACKLOG.md's "ไม่อยู่ใน scope" list) — leaving 3 primary tabs;
 * InviteGuest/QrDisplay/EntryHistory are reached from Home's shortcut
 * cards rather than being top-level tabs, matching the spec's wireframe
 * (only Home/Announcements/Chat/More are bottom-nav items, everything else
 * is a drill-in screen).
 *
 * Dev agent TODO: swap the plain Stack-of-screens-without-tab-icons below
 * for real `@react-navigation/bottom-tabs` `tabBarIcon`s once icon assets
 * are chosen (e.g. `@expo/vector-icons`, already bundled with Expo).
 */
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
import { ProfileScreen } from "../screens/resident/ProfileScreen";
import type { ResidentTabParamList } from "./types";

const HomeStack = createNativeStackNavigator<ResidentTabParamList>();
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
        name="Home"
        component={ResidentHomeScreen}
        options={{ title: "หน้าแรก" }}
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

const Tab = createBottomTabNavigator<ResidentTabParamList>();

export function ResidentTabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{ headerShown: false, title: "หน้าแรก" }}
      />
      <Tab.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ title: "ประกาศ" }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "เพิ่มเติม" }}
      />
    </Tab.Navigator>
  );
}
