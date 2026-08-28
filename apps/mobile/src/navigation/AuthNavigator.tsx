import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PhoneLoginScreen } from "../screens/auth/PhoneLoginScreen";
import { OtpVerifyScreen } from "../screens/auth/OtpVerifyScreen";
import type { AuthStackParamList } from "./types";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
      <Stack.Screen
        name="OtpVerify"
        component={OtpVerifyScreen}
        options={{ headerShown: true, title: "ยืนยัน OTP" }}
      />
    </Stack.Navigator>
  );
}
