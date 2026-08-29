/**
 * "หน้ายืนยันแขกออก" (spec 2.1's dual-confirm flow, guard side) —
 * MVP_BACKLOG.md Epic 7.
 *
 * Design decision (per the original doc comment's "pick one and note the
 * decision here"): this is a standalone list of open entries, not a re-use
 * of ScanQrScreen with an exit-mode flag. Rationale: the exit point often
 * isn't the same physical gate/kiosk as the entry scan, guards may need to
 * confirm an exit for a visitor whose QR the visitor no longer has (already
 * handed back / thrown away), and a plain searchable list keeps the "no
 * auto-close from a scan" invariant obviously true by construction — there
 * is no scan step in this screen at all, only an explicit "ยืนยันแขกออก"
 * button per row, which is the **only** path that ever sets `exitTime`
 * (spec 2.1).
 *
 * QA fix: "open" entries now come from the server-side `exited=false` filter
 * (`GET /entry-logs?exited=false`, entry-log.service.ts) instead of a
 * client-side `!exitTime` filter over a single pageSize=100 page — the old
 * approach silently dropped open visitors past the 100th if a gate had more
 * than 100 not-yet-exited guests at once. `loadAllOpen()` below pages
 * through the server-filtered result until every open entry is fetched (capped
 * at MAX_PAGES as a sanity bound against a runaway loop, not a real limit —
 * even a very busy gate should never legitimately have thousands of
 * simultaneously-open visitors).
 */
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
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
import { colors, radius, spacing } from "../../theme";

const PAGE_SIZE = 100;
const MAX_PAGES = 20; // sanity bound (2000 open entries) — see file doc comment.

async function loadAllOpen(): Promise<EntryLog[]> {
  const all: EntryLog[] = [];
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const res = await api.get<Paginated<EntryLog>>(
      `/entry-logs?exited=false&page=${page}&pageSize=${PAGE_SIZE}`,
    );
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}

export function ExitConfirmScreen() {
  const [logs, setLogs] = useState<EntryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await loadAllOpen());
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
        placeholderTextColor={colors.textMuted}
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
            <View style={styles.iconWrap}>
              <Text style={styles.icon}>🚶</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.visitorName ?? "(ไม่ระบุชื่อ)"}</Text>
              {item.vehiclePlate ? <Text style={styles.meta}>ทะเบียน: {item.vehiclePlate}</Text> : null}
              <Text style={styles.meta}>เข้าเมื่อ: {new Date(item.entryTime).toLocaleString("th-TH")}</Text>
            </View>
            <Button
              title="ยืนยันแขกออก"
              onPress={() => handleConfirm(item)}
              loading={confirmingId === item.id}
              style={styles.confirmButton}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: {
    margin: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.warningLight,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 18 },
  name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  confirmButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
