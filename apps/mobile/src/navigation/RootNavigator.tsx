/**
 * Top-level switch: Auth stack vs. Resident tabs vs. Guard tabs, based on
 * `AuthContext`'s session (src/context/AuthContext.tsx). This is the one
 * place role-based routing happens — see docs/ARCHITECTURE.md's mobile
 * section for why this is one Expo app with role-based navigation instead
 * of two separate apps.
 */
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { AuthNavigator } from "./AuthNavigator";
import { ResidentTabNavigator } from "./ResidentTabNavigator";
import { GuardTabNavigator } from "./GuardTabNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session, loading } = useAuth();

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
    <NavigationContainer>
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
