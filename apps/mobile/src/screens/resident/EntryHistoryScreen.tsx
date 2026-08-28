/**
 * "หน้าประวัติเข้า-ออก" (spec 1.1) — MVP_BACKLOG.md Epic 6. Shared UI shape
 * with the Guard app's own history view, but scoped: residents only ever
 * see their own house's entries (enforced server-side, see
 * entry-log.controller.ts's `list()` doc comment: "residents are scoped to
 * their own house_id in the service regardless of what house_id they pass").
 *
 * Dev agent TODO:
 *  - `api.get('/entry-logs?date=...')` (house_id omitted/ignored for a
 *    resident caller — don't bother sending it), paginated
 *    (`Paginated<EntryLog>` from src/lib/types.ts).
 *  - Timeline list: photo (`photoUrl`, if present), visitor name, entry
 *    time, exit time (or "ยังไม่ออก"), recorded-by.
 *  - Date filter/search (spec: "ค้นหา/กรองตามวันที่").
 *  - "ยืนยันแขกออก" button per row where `exitTime` is null — calls
 *    `api.patch('/entry-logs/:id/confirm-exit')` (spec 2.1's dual-confirm
 *    flow; resident is one of the two allowed confirmers, see
 *    entry-log.controller.ts's `confirmExit()`).
 */
import { StyleSheet, Text, View } from "react-native";

export function EntryHistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ประวัติเข้า-ออก</Text>
      <Text style={styles.todo}>
        TODO: timeline จาก GET /entry-logs + ปุ่ม "ยืนยันแขกออก" (PATCH
        /entry-logs/:id/confirm-exit) — ดู doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
