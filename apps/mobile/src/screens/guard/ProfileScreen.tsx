/**
 * Guard profile/logout. Not in spec 1.2's wireframe (which only lists Home,
 * Scan, Manual Entry, SOS) — added because every authenticated app needs a
 * way to sign out, and Guard had no path to it at all (unlike Resident,
 * which has ProfileScreen.tsx). Mirrors that screen's logout pattern:
 * best-effort server-side revoke via `POST /auth/logout`, then always clear
 * the local session regardless of whether the server call succeeded.
 */
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api, ApiError } from "../../lib/api";
import { clearSession } from "../../lib/auth";
import { useAuth } from "../../context/AuthContext";

export function GuardProfileScreen() {
  const { session, setSession } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (!session) return;
    setLoggingOut(true);
    try {
      await api.post("/auth/logout", { refreshToken: session.refreshToken });
    } catch (e) {
      if (!(e instanceof ApiError)) {
        Alert.alert("ออกจากระบบ", "ไม่สามารถแจ้งเซิร์ฟเวอร์ได้ แต่จะออกจากระบบในเครื่องนี้");
      }
    } finally {
      await clearSession();
      setSession(null);
      setLoggingOut(false);
    }
  }

  if (!session) return null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>ชื่อ</Text>
        <Text style={styles.value}>{session.name}</Text>

        <Text style={styles.label}>เบอร์โทร</Text>
        <Text style={styles.value}>{session.phone}</Text>

        <Text style={styles.label}>บทบาท</Text>
        <Text style={styles.value}>รปภ.</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
        {loggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.logoutText}>ออกจากระบบ</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  card: { backgroundColor: "#f7f7f7", borderRadius: 12, padding: 16 },
  label: { fontSize: 12, color: "#888", marginTop: 12 },
  value: { fontSize: 16, fontWeight: "600", marginTop: 2 },
  logoutButton: {
    marginTop: 24,
    backgroundColor: "#c0392b",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
