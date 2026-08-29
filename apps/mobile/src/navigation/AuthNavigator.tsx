import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PhoneLoginScreen } from "../screens/auth/PhoneLoginScreen";
import { OtpVerifyScreen } from "../screens/auth/OtpVerifyScreen";
import type { AuthStackParamList } from "./types";
import { colors } from "../theme";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Only OtpVerify below turns its header on — themed here so that
        // when it does, it matches the resident/guard app's green header
        // instead of the native default white one.
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
      <Stack.Screen
        name="OtpVerify"
        component={OtpVerifyScreen}
        options={{ headerShown: true, title: "ยืนยัน OTP" }}
      />
    </Stack.Navigator>
  );
}
