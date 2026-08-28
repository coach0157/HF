/**
 * Root entry point. Wires `AuthProvider` (src/context/AuthContext.tsx)
 * around `RootNavigator` (src/navigation/RootNavigator.tsx), which is the
 * only place that decides Auth vs. Resident vs. Guard — see
 * docs/ARCHITECTURE.md's mobile section.
 */
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
