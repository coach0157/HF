/**
 * Resident home (spec 1.1 "หน้าแรก") — MVP_BACKLOG.md Epic 6.
 *
 *  - Top bar: village name + notification bell with unread-announcement
 *    badge (count of `GET /announcements` items with an empty `reads`
 *    array — see lib/types.ts's Announcement.reads doc comment).
 *  - Large red SOS button (SosHoldButton, 2s hold) — on fire, resolves GPS
 *    via `expo-location` (falls back to no coordinates if permission is
 *    denied/unavailable — dto fields are optional) then
 *    `POST /sos-alerts`.
 *  - Shortcut cards: "เชิญแขก (QR)" -> InviteGuest, "ประวัติเข้า-ออก" ->
 *    EntryHistory (MVP, MVP_BACKLOG.md Epic 6), "เรียกรถโดยสาร" -> Transport
 *    and "แจ้งซ่อม" -> Maintenance (Phase 2, docs/PHASE2_BACKLOG.md Epic
 *    10/9) — matches spec 1.1's 2x3 shortcut grid except "จองพื้นที่" /
 *    "ชำระค่าส่วนกลาง" (Phase 3, out of scope).
 *  - Latest-3 announcement preview, tap-through to the Announcements tab.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import type { Announcement } from "../../lib/types";
import type { ResidentTabParamList } from "../../navigation/types";
import { SosHoldButton } from "../../components/SosHoldButton";
import { colors, radius, spacing } from "../../theme";

const LEVEL_COLOR: Record<Announcement["level"], string> = {
  NORMAL: colors.textMuted,
  IMPORTANT: colors.warning,
  EMERGENCY: colors.danger,
};

export function ResidentHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ResidentTabParamList, "Home">>();
  const { session } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sosSending, setSosSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const items = await api.get<Announcement[]>("/announcements");
      setAnnouncements(items);
    } catch {
      // Non-critical for the home screen preview; swallow and leave the
      // previous list (or empty) rather than blocking the whole screen.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const unreadCount = announcements.filter((a) => (a.reads?.length ?? 0) === 0).length;
  const latest3 = announcements.slice(0, 3);

  async function handleSos() {
    if (sosSending) return;
    setSosSending(true);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        }
      } catch {
        // GPS unavailable — SOS still fires without coordinates, per
        // CreateSosAlertDto's optional lat/lng.
      }
      await api.post("/sos-alerts", { latitude, longitude });
      Alert.alert("ส่งสัญญาณ SOS แล้ว", "รปภ. ที่ปฏิบัติหน้าที่จะได้รับแจ้งทันที");
    } catch (e) {
      Alert.alert("ส่ง SOS ไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
    } finally {
      setSosSending(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.topBar}>
        <Text style={styles.villageName}>หมู่บ้าน</Text>
        <TouchableOpacity
          style={styles.bell}
          onPress={() => navigation.getParent()?.navigate("Announcements" as never)}
        >
          <Text style={styles.bellIcon}>🔔</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.greeting}>สวัสดี {session?.name ?? ""}</Text>

      <View style={styles.sosWrap}>
        <SosHoldButton onTrigger={handleSos} />
        {sosSending && <ActivityIndicator style={{ marginTop: spacing.sm }} />}
      </View>

      <View style={styles.cardsRow}>
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("InviteGuest")}>
          <Text style={styles.cardIcon}>📷</Text>
          <Text style={styles.cardLabel}>เชิญแขก (QR)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("EntryHistory")}>
          <Text style={styles.cardIcon}>🕒</Text>
          <Text style={styles.cardLabel}>ประวัติเข้า-ออก</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("Transport")}>
          <Text style={styles.cardIcon}>🚕</Text>
          <Text style={styles.cardLabel}>เรียกรถโดยสาร</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("Maintenance")}>
          <Text style={styles.cardIcon}>🔧</Text>
          <Text style={styles.cardLabel}>แจ้งซ่อม</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>ประกาศล่าสุด</Text>
      {latest3.length === 0 && !loading ? (
        <Text style={styles.empty}>ยังไม่มีประกาศ</Text>
      ) : (
        latest3.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={styles.announcementRow}
            onPress={() => navigation.getParent()?.navigate("Announcements" as never)}
          >
            <View style={[styles.levelDot, { backgroundColor: LEVEL_COLOR[a.level] }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.announcementTitle} numberOfLines={1}>
                {a.title}
              </Text>
              <Text style={styles.announcementDate}>
                {new Date(a.createdAt).toLocaleString("th-TH")}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
  },
  villageName: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
  bell: { padding: spacing.xs },
  bellIcon: { fontSize: 22 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  greeting: {
    fontSize: 16,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sosWrap: { alignItems: "center", marginVertical: spacing.xl },
  cardsRow: { flexDirection: "row", paddingHorizontal: spacing.lg, gap: spacing.md },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  cardIcon: { fontSize: 26 },
  cardLabel: { fontSize: 13, fontWeight: "600", textAlign: "center", color: colors.textPrimary },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  empty: { color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  announcementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  levelDot: { width: 10, height: 10, borderRadius: 5 },
  announcementTitle: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  announcementDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
