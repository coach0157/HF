/**
 * "หน้าเพิ่มเติม / โปรไฟล์" (spec 1.1) — MVP_BACKLOG.md Epic 6.
 *
 * Household info: `GET /users/me` only returns JWT claims
 * (villageId/userId/role/houseId — see users.controller.ts's `me()`, which
 * literally returns `@CurrentUser()`), not name/phone/house_no. Name/phone
 * already live in the locally-stored session (from the login response), so
 * this screen shows those immediately and additionally calls
 * `GET /users/:id` (self) + `GET /houses/:id` (own house) — both opened to
 * RESIDENT-for-own-record by the previous dev-agent round — for house_no/
 * zone, which the session doesn't carry.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api, ApiError } from "../../lib/api";
import { clearSession } from "../../lib/auth";
import { disconnectChatSocket } from "../../lib/chat";
import { unregisterPushTokenAsync } from "../../lib/push";
import { useAuth } from "../../context/AuthContext";
import type { House } from "../../lib/types";

export function ProfileScreen() {
  const { session, setSession } = useAuth();
  const [house, setHouse] = useState<House | null>(null);
  const [loadingHouse, setLoadingHouse] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!session?.houseId) return;
    setLoadingHouse(true);
    api
      .get<House>(`/houses/${session.houseId}`)
      .then(setHouse)
      .catch(() => {
        // Non-critical — the rest of the profile screen still works without
        // house_no/zone.
      })
      .finally(() => setLoadingHouse(false));
  }, [session?.houseId]);

  async function handleLogout() {
    if (!session) return;
    setLoggingOut(true);
    try {
      await api.post("/auth/logout", { refreshToken: session.refreshToken });
    } catch (e) {
      // Still log out locally even if the server call fails (e.g. token
      // already expired) — there's nothing the user can do about a failed
      // revoke, and staying logged in on the device would be worse.
      if (!(e instanceof ApiError)) {
        Alert.alert("ออกจากระบบ", "ไม่สามารถแจ้งเซิร์ฟเวอร์ได้ แต่จะออกจากระบบในเครื่องนี้");
      }
    } finally {
      disconnectChatSocket();
      // Epic 11 (ADR-006): must run BEFORE clearSession() — it needs the
      // still-valid JWT to call DELETE /push-tokens.
      await unregisterPushTokenAsync();
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
        <Text style={styles.value}>{session.role === "RESIDENT" ? "ลูกบ้าน" : "รปภ."}</Text>

        <Text style={styles.label}>บ้านเลขที่</Text>
        {loadingHouse ? (
          <ActivityIndicator size="small" style={{ alignSelf: "flex-start", marginTop: 4 }} />
        ) : (
          <Text style={styles.value}>{house ? `${house.houseNo}${house.zone ? ` (โซน ${house.zone})` : ""}` : "-"}</Text>
        )}
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
