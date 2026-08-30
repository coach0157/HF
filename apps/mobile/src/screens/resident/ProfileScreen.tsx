/**
 * "หน้าเพิ่มเติม / โปรไฟล์" (spec 1.1) — MVP_BACKLOG.md Epic 6.
 *
 * Household info: name/phone/role/houseId already live in the
 * locally-stored session (from the login response), so this screen shows
 * those immediately and additionally calls `GET /houses/:id` (own house)
 * for house_no/zone, which the session doesn't carry.
 *
 * Dev-agent note (avatar upload feature): `GET /users/me` used to only
 * return JWT claims (villageId/userId/role/houseId — see
 * users.controller.ts's `me()`, which used to literally return
 * `@CurrentUser()`), but was changed to return the live DB row instead so
 * this screen (and GuardProfileScreen) can fetch `avatarUrl`, which isn't
 * part of the login response or the JWT claims.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../lib/api";
import { clearSession } from "../../lib/auth";
import { disconnectChatSocket } from "../../lib/chat";
import { unregisterPushTokenAsync } from "../../lib/push";
import { useAuth } from "../../context/AuthContext";
import type { AppUser, House } from "../../lib/types";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Avatar } from "../../components/Avatar";
import { colors, spacing } from "../../theme";

export function ProfileScreen() {
  const { session, setSession, updateAvatarUrl } = useAuth();
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

  // Avatar upload feature (Dev-agent addition). `POST /auth/login`'s
  // response never carries avatarUrl (see lib/auth.ts's MobileSession doc
  // comment), so the session doesn't have it right after login — fetch it
  // once here via `GET /users/me` (now returns the live DB row, per
  // users.controller.ts's `me()` doc comment) and fold it into the session
  // so it's available everywhere and survives a relaunch.
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
    // Only re-run when the logged-in user changes, not on every avatarUrl
    // update this effect itself may cause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

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
      <Card>
        <View style={styles.avatarWrap}>
          <Avatar
            name={session.name}
            avatarUrl={session.avatarUrl}
            editable
            onUploaded={updateAvatarUrl}
          />
        </View>

        <Text style={styles.label}>ชื่อ</Text>
        <Text style={styles.value}>{session.name}</Text>

        <Text style={styles.label}>เบอร์โทร</Text>
        <Text style={styles.value}>{session.phone}</Text>

        <Text style={styles.label}>บทบาท</Text>
        <Text style={styles.value}>{session.role === "RESIDENT" ? "ลูกบ้าน" : "รปภ."}</Text>

        <Text style={styles.label}>บ้านเลขที่</Text>
        {loadingHouse ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: "flex-start", marginTop: spacing.xs }} />
        ) : (
          <Text style={styles.value}>{house ? `${house.houseNo}${house.zone ? ` (โซน ${house.zone})` : ""}` : "-"}</Text>
        )}
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
