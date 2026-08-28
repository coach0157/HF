/**
 * "หน้ายืนยันแขกออก" (spec 2.1's dual-confirm flow, guard side) —
 * MVP_BACKLOG.md Epic 7.
 *
 * Design decision (per the original doc comment's "pick one and note the
 * decision here"): this is a standalone list of open entries
 * (`exitTime === null`, filtered client-side from `GET /entry-logs`), not a
 * re-use of ScanQrScreen with an exit-mode flag. Rationale: the exit point
 * often isn't the same physical gate/kiosk as the entry scan, guards may
 * need to confirm an exit for a visitor whose QR the visitor no longer has
 * (already handed back / thrown away), and a plain searchable list keeps
 * the "no auto-close from a scan" invariant obviously true by construction
 * — there is no scan step in this screen at all, only an explicit
 * "ยืนยันแขกออก" button per row, which is the **only** path that ever sets
 * `exitTime` (spec 2.1).
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

export function ExitConfirmScreen() {
  const [logs, setLogs] = useState<EntryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No server-side "open only" filter exists — page through recent
      // entries and filter client-side. pageSize=100 comfortably covers a
      // gate's open (not-yet-exited) visitors at any one time for MVP.
      const res = await api.get<Paginated<EntryLog>>("/entry-logs?pageSize=100");
      setLogs(res.items.filter((l) => !l.exitTime));
    } catch (e) {
      Alert.alert("โหลดรายการไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleConfirm(log: EntryLog) {
    setConfirmingId(log.id);
    try {
      await api.patch(`/entry-logs/${log.id}/confirm-exit`);
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
    } catch (e) {
      Alert.alert("ยืนยันไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
    } finally {
      setConfirmingId(null);
    }
  }

  const filtered = query.trim()
    ? logs.filter(
        (l) =>
          l.visitorName?.toLowerCase().includes(query.trim().toLowerCase()) ||
          l.vehiclePlate?.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : logs;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="ค้นหาชื่อแขก/ทะเบียนรถ"
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={filtered}
        keyExtractor={(l) => l.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>ไม่มีแขกที่ยังไม่ออก</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.visitorName ?? "(ไม่ระบุชื่อ)"}</Text>
              {item.vehiclePlate ? <Text style={styles.meta}>ทะเบียน: {item.vehiclePlate}</Text> : null}
              <Text style={styles.meta}>เข้าเมื่อ: {new Date(item.entryTime).toLocaleString("th-TH")}</Text>
            </View>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => handleConfirm(item)}
              disabled={confirmingId === item.id}
            >
              {confirmingId === item.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmText}>ยืนยันแขกออก</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  search: {
    margin: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  empty: { color: "#999", textAlign: "center", padding: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    gap: 10,
  },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12, color: "#666", marginTop: 2 },
  confirmButton: { backgroundColor: "#1d6f42", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  confirmText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
