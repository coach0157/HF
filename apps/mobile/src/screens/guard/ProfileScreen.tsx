/**
 * Guard profile/logout. Not in spec 1.2's wireframe (which only lists Home,
 * Scan, Manual Entry, SOS) — added because every authenticated app needs a
 * way to sign out, and Guard had no path to it at all (unlike Resident,
 * which has ProfileScreen.tsx). Mirrors that screen's logout pattern:
 * best-effort server-side revoke via `POST /auth/logout`, then always clear
 * the local session regardless of whether the server call succeeded.
 */
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { api, ApiError } from "../../lib/api";
import { clearSession } from "../../lib/auth";
import { disconnectChatSocket } from "../../lib/chat";
import { unregisterPushTokenAsync } from "../../lib/push";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";

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
      <Card>
        <Text style={styles.label}>ชื่อ</Text>
        <Text style={styles.value}>{session.name}</Text>

        <Text style={styles.label}>เบอร์โทร</Text>
        <Text style={styles.value}>{session.phone}</Text>

        <Text style={styles.label}>บทบาท</Text>
        <Text style={styles.value}>รปภ.</Text>
      </Card>

      <Button
        title="ออกจากระบบ"
        variant="danger"
        onPress={handleLogout}
        loading={loggingOut}
        style={styles.logoutButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  label: { fontSize: 12, color: colors.textMuted, marginTop: spacing.md },
  value: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, marginTop: 2 },
  logoutButton: { marginTop: spacing.xl },
});
