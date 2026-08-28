/**
 * "แจ้งซ่อม" list screen (spec 1.1 shortcut card / spec 2.4 — Epic 9,
 * docs/PHASE2_BACKLOG.md Epic 9). Residents are scoped to their own house's
 * tickets server-side (maintenance.service.ts's `list()`), same pattern as
 * EntryHistoryScreen.tsx. Tapping "+ แจ้งซ่อมใหม่" navigates to
 * CreateMaintenanceScreen; tapping a ticket row shows its full status.
 */
import { useCallback, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiError } from "../../lib/api";
import type {
  MaintenanceCategory,
  MaintenanceStatus,
  MaintenanceTicket,
  Paginated,
} from "../../lib/types";
import type { ResidentTabParamList } from "../../navigation/types";

const CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  ELECTRICAL: "ไฟฟ้า",
  PLUMBING: "ประปา",
  ROAD: "ถนน",
  OTHER: "อื่นๆ",
};

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: "รับเรื่อง",
  IN_PROGRESS: "กำลังดำเนินการ",
  DONE: "เสร็จสิ้น",
};

const STATUS_COLOR: Record<MaintenanceStatus, string> = {
  OPEN: "#f39c12",
  IN_PROGRESS: "#2980b9",
  DONE: "#27ae60",
};

export function MaintenanceScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ResidentTabParamList, "Maintenance">>();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Paginated<MaintenanceTicket>>(
        "/maintenance-tickets?pageSize=50",
      );
      setTickets(res.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดรายการแจ้งซ่อมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate("CreateMaintenance")}
      >
        <Text style={styles.createButtonText}>+ แจ้งซ่อมใหม่</Text>
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          !loading && !error ? <Text style={styles.empty}>ยังไม่มีรายการแจ้งซ่อม</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticketNumber}>{item.ticketNumber}</Text>
              <Text style={styles.category}>{CATEGORY_LABEL[item.category]}</Text>
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
              {item.scheduledDate && (
                <Text style={styles.meta}>
                  นัดหมาย: {new Date(item.scheduledDate).toLocaleDateString("th-TH")}
                </Text>
              )}
              {item.assignedTo && <Text style={styles.meta}>ผู้รับผิดชอบ: {item.assignedTo}</Text>}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[item.status] }]}>
              <Text style={styles.statusText}>{STATUS_LABEL[item.status]}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  createButton: {
    margin: 16,
    backgroundColor: "#1d6f42",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  createButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  errorText: { color: "#c0392b", paddingHorizontal: 16, paddingBottom: 8 },
  empty: { color: "#999", textAlign: "center", padding: 24 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  ticketNumber: { fontSize: 14, fontWeight: "700" },
  category: { fontSize: 12, color: "#666", marginTop: 2 },
  description: { fontSize: 13, color: "#333", marginTop: 4 },
  meta: { fontSize: 11, color: "#999", marginTop: 4 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
