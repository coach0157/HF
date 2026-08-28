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
 *  - Shortcut cards, MVP-scoped: "เชิญแขก (QR)" -> InviteGuest,
 *    "ประวัติเข้า-ออก" -> EntryHistory (spec's full 2x3 grid also lists
 *    out-of-scope items per MVP_BACKLOG.md).
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

const LEVEL_COLOR: Record<Announcement["level"], string> = {
  NORMAL: "#7f8c8d",
  IMPORTANT: "#f39c12",
  EMERGENCY: "#c0392b",
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
        {sosSending && <ActivityIndicator style={{ marginTop: 8 }} />}
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
  container: { flex: 1, backgroundColor: "#fff" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  villageName: { fontSize: 18, fontWeight: "700" },
  bell: { padding: 4 },
  bellIcon: { fontSize: 22 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#c0392b",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  greeting: { fontSize: 16, color: "#444", paddingHorizontal: 16, marginBottom: 8 },
  sosWrap: { alignItems: "center", marginVertical: 20 },
  cardsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 12 },
  card: {
    flex: 1,
    backgroundColor: "#f2f6f4",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  cardIcon: { fontSize: 26 },
  cardLabel: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "700", padding: 16, paddingBottom: 8 },
  empty: { color: "#999", paddingHorizontal: 16, paddingBottom: 24 },
  announcementRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  levelDot: { width: 10, height: 10, borderRadius: 5 },
  announcementTitle: { fontSize: 14, fontWeight: "600" },
  announcementDate: { fontSize: 11, color: "#999", marginTop: 2 },
});
