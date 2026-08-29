/**
 * "หน้าประวัติเข้า-ออก" (spec 1.1) — MVP_BACKLOG.md Epic 6. Residents are
 * scoped to their own house_id server-side regardless of what house_id
 * they pass (entry-log.controller.ts's `list()`), so this screen never
 * sends `house_id` at all.
 */
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../lib/api";
import type { EntryLog, Paginated } from "../../lib/types";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { colors, radius, spacing } from "../../theme";

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
          placeholderTextColor={colors.textMuted}
          value={date}
          onChangeText={setDate}
          onSubmitEditing={() => load(date)}
        />
        <Button title="ค้นหา" variant="secondary" onPress={() => load(date)} style={styles.filterButton} />
        {date.length > 0 && (
          <Button
            title="ล้าง"
            variant="secondary"
            onPress={() => {
              setDate("");
              load("");
            }}
            style={styles.filterButton}
          />
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
              <View style={styles.nameRow}>
                <Text style={styles.name}>{item.visitorName ?? "(ไม่ระบุชื่อ)"}</Text>
                <Badge
                  label={item.exitTime ? "ออกแล้ว" : "อยู่ในหมู่บ้าน"}
                  variant={item.exitTime ? "neutral" : "warning"}
                />
              </View>
              {item.vehiclePlate ? <Text style={styles.meta}>ทะเบียน: {item.vehiclePlate}</Text> : null}
              <Text style={styles.meta}>เข้า: {fmt(item.entryTime)}</Text>
              <Text style={styles.meta}>ออก: {fmt(item.exitTime)}</Text>
              <Text style={styles.metaSmall}>บันทึกโดย: {item.method === "QR" ? "สแกน QR" : "รปภ. บันทึกด้วยมือ"}</Text>

              {!item.exitTime && (
                <Button
                  title="ยืนยันแขกออก"
                  onPress={() => handleConfirmExit(item)}
                  loading={confirmingId === item.id}
                  style={styles.confirmButton}
                />
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: { flexDirection: "row", padding: spacing.md, gap: spacing.sm, alignItems: "center" },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  filterButton: { paddingVertical: spacing.sm + 1, paddingHorizontal: spacing.md },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
  row: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  photo: { width: 56, height: 56, borderRadius: spacing.sm },
  photoPlaceholder: { backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  name: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  metaSmall: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  confirmButton: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.md,
  },
});
