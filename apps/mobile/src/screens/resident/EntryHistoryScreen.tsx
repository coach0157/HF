/**
 * "หน้าประวัติเข้า-ออก" (spec 1.1) — MVP_BACKLOG.md Epic 6. Residents are
 * scoped to their own house_id server-side regardless of what house_id
 * they pass (entry-log.controller.ts's `list()`), so this screen never
 * sends `house_id` at all.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../lib/api";
import type { EntryLog, Paginated } from "../../lib/types";

function fmt(iso: string | null): string {
  if (!iso) return "ยังไม่ออก";
  return new Date(iso).toLocaleString("th-TH");
}

export function EntryHistoryScreen() {
  const [logs, setLogs] = useState<EntryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(""); // YYYY-MM-DD filter, optional
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async (dateFilter: string) => {
    setLoading(true);
    try {
      const qs = dateFilter ? `?date=${encodeURIComponent(dateFilter)}&pageSize=100` : "?pageSize=100";
      const res = await api.get<Paginated<EntryLog>>(`/entry-logs${qs}`);
      setLogs(res.items);
    } catch (e) {
      Alert.alert("โหลดประวัติไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(date);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  async function handleConfirmExit(log: EntryLog) {
    setConfirmingId(log.id);
    try {
      await api.patch(`/entry-logs/${log.id}/confirm-exit`);
      load(date);
    } catch (e) {
      Alert.alert("ยืนยันแขกออกไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <TextInput
          style={styles.dateInput}
          placeholder="กรองวันที่ YYYY-MM-DD"
          value={date}
          onChangeText={setDate}
          onSubmitEditing={() => load(date)}
        />
        <TouchableOpacity style={styles.filterButton} onPress={() => load(date)}>
          <Text style={styles.filterButtonText}>ค้นหา</Text>
        </TouchableOpacity>
        {date.length > 0 && (
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => {
              setDate("");
              load("");
            }}
          >
            <Text style={styles.filterButtonText}>ล้าง</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(date)} />}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>ไม่มีประวัติเข้า-ออก</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.photoUrl ? (
              <Image source={{ uri: item.photoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <Text style={{ fontSize: 18 }}>👤</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.visitorName ?? "(ไม่ระบุชื่อ)"}</Text>
              {item.vehiclePlate ? <Text style={styles.meta}>ทะเบียน: {item.vehiclePlate}</Text> : null}
              <Text style={styles.meta}>เข้า: {fmt(item.entryTime)}</Text>
              <Text style={styles.meta}>ออก: {fmt(item.exitTime)}</Text>
              <Text style={styles.metaSmall}>บันทึกโดย: {item.method === "QR" ? "สแกน QR" : "รปภ. บันทึกด้วยมือ"}</Text>

              {!item.exitTime && (
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => handleConfirmExit(item)}
                  disabled={confirmingId === item.id}
                >
                  {confirmingId === item.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmText}>ยืนยันแขกออก</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  filterRow: { flexDirection: "row", padding: 12, gap: 8, alignItems: "center" },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  filterButton: { backgroundColor: "#1d6f42", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  filterButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  empty: { color: "#999", textAlign: "center", padding: 24 },
  row: {
    flexDirection: "row",
    padding: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  photo: { width: 56, height: 56, borderRadius: 8 },
  photoPlaceholder: { backgroundColor: "#eee", alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "700" },
  meta: { fontSize: 12, color: "#555", marginTop: 2 },
  metaSmall: { fontSize: 11, color: "#999", marginTop: 2 },
  confirmButton: {
    marginTop: 8,
    backgroundColor: "#2980b9",
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 14,
  },
  confirmText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
