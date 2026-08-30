/**
 * Guard profile/logout. Not in spec 1.2's wireframe (which only lists Home,
 * Scan, Manual Entry, SOS) — added because every authenticated app needs a
 * way to sign out, and Guard had no path to it at all (unlike Resident,
 * which has ProfileScreen.tsx). Mirrors that screen's logout pattern:
 * best-effort server-side revoke via `POST /auth/logout`, then always clear
 * the local session regardless of whether the server call succeeded.
 */
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../lib/api";
import { clearSession } from "../../lib/auth";
import { disconnectChatSocket } from "../../lib/chat";
import { unregisterPushTokenAsync } from "../../lib/push";
import { useAuth } from "../../context/AuthContext";
import type { AppUser } from "../../lib/types";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Avatar } from "../../components/Avatar";
import { colors, spacing } from "../../theme";

export function GuardProfileScreen() {
  const { session, setSession, updateAvatarUrl } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  // Avatar upload feature (Dev-agent addition) — see ResidentProfileScreen's
  // matching effect for why this fetch is needed (login response doesn't
  // carry avatarUrl).
  useEffect(() => {
    if (!session?.userId) return;
    api
      .get<AppUser>("/users/me")
      .then((me) => {
        if (me.avatarUrl !== session.avatarUrl) {
          updateAvatarUrl(me.avatarUrl ?? null);
        }
      })
      .catch(() => {
        // Non-critical — falls back to the initial-letter placeholder.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

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
        <View style={styles.avatarWrap}>
          <Avatar
            name={session.name}
            avatarUrl={session.avatarUrl}
            accessToken={session.accessToken}
            editable
            onUploaded={updateAvatarUrl}
          />
        </View>

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
  avatarWrap: { marginBottom: spacing.sm },
  label: { fontSize: 12, color: colors.textMuted, marginTop: spacing.md },
  value: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, marginTop: 2 },
  logoutButton: { marginTop: spacing.xl },
});
