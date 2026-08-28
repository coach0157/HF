/**
 * Guard bottom tabs (spec 1.2 has no explicit bottom-nav wireframe — spec
 * 1.1's nav pattern is reused for consistency: 4 screens as tabs instead of
 * drill-ins, since a Guard's screens are all equally primary during a shift
 * rather than one "home" with shortcuts).
 */
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { GuardHomeScreen } from "../screens/guard/HomeScreen";
import { ScanQrScreen } from "../screens/guard/ScanQrScreen";
import { ManualEntryScreen } from "../screens/guard/ManualEntryScreen";
import { ExitConfirmScreen } from "../screens/guard/ExitConfirmScreen";
import { SosListScreen } from "../screens/guard/SosListScreen";
import type { GuardTabParamList } from "./types";

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
    </Tab.Navigator>
  );
}
