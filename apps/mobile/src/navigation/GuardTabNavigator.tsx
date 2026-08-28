/**
 * Guard bottom tabs (spec 1.2 has no explicit bottom-nav wireframe — spec
 * 1.1's nav pattern is reused for consistency: screens as tabs instead of
 * drill-ins, since a Guard's screens are all equally primary during a shift
 * rather than one "home" with shortcuts). "Chat" added for Epic 8 (spec
 * 2.3's "ลูกบ้าน-รปภ." 1:1 chat side, docs/PHASE2_BACKLOG.md Epic 8).
 */
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GuardHomeScreen } from "../screens/guard/HomeScreen";
import { ScanQrScreen } from "../screens/guard/ScanQrScreen";
import { ManualEntryScreen } from "../screens/guard/ManualEntryScreen";
import { ExitConfirmScreen } from "../screens/guard/ExitConfirmScreen";
import { SosListScreen } from "../screens/guard/SosListScreen";
import { ChatListScreen } from "../screens/guard/ChatListScreen";
import { ChatRoomScreen } from "../screens/shared/ChatRoomScreen";
import { GuardProfileScreen } from "../screens/guard/ProfileScreen";
import type { ChatStackParamList, GuardTabParamList } from "./types";

// Nested stack so ChatListScreen can drill into the shared ChatRoomScreen —
// same pattern as ResidentTabNavigator's ChatStackNavigator.
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
function ChatStackNavigator() {
  return (
    <ChatStack.Navigator>
      <ChatStack.Screen name="ChatList" component={ChatListScreen} options={{ title: "แชท" }} />
      <ChatStack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ title: "" }} />
    </ChatStack.Navigator>
  );
}

const Tab = createBottomTabNavigator<GuardTabParamList>();

export function GuardTabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={GuardHomeScreen} options={{ title: "หน้าแรก" }} />
      <Tab.Screen name="ScanQr" component={ScanQrScreen} options={{ title: "สแกน QR" }} />
      <Tab.Screen
        name="ManualEntry"
        component={ManualEntryScreen}
        options={{ title: "บันทึกด้วยมือ" }}
      />
      <Tab.Screen
        name="ExitConfirm"
        component={ExitConfirmScreen}
        options={{ title: "ยืนยันแขกออก" }}
      />
      <Tab.Screen name="SosList" component={SosListScreen} options={{ title: "SOS" }} />
      <Tab.Screen
        name="Chat"
        component={ChatStackNavigator}
        options={{ headerShown: false, title: "แชท" }}
      />
      <Tab.Screen name="Profile" component={GuardProfileScreen} options={{ title: "โปรไฟล์" }} />
    </Tab.Navigator>
  );
}
