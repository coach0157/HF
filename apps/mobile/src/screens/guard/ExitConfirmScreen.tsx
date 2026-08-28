/**
 * "หน้ายืนยันแขกออก" (spec 2.1's dual-confirm flow, guard side) —
 * MVP_BACKLOG.md Epic 7. Mirrors the resident's own confirm-exit action in
 * EntryHistoryScreen (apps/mobile/src/screens/resident/EntryHistoryScreen.tsx)
 * but scoped to guard duties: guard scans/finds the open entry (no
 * `exitTime` yet) and confirms.
 *
 * Dev agent TODO:
 *  - List/search open entries (`exitTime === null`) — `GET /entry-logs`
 *    filtered client-side, or scan the QR again at the exit point and
 *    resolve the entry log from the pass first (design call: spec 2.1 says
 *    "รปภ. สแกน QR ที่จุดออก แล้วกดปุ่ม 'ยืนยันแขกออก' อีกครั้ง" — decide
 *    whether that reuses ScanQrScreen with an exit-mode flag, or this is a
 *    separate manual list; either is valid, pick one and note the decision
 *    here).
 *  - Confirm button -> `api.patch('/entry-logs/:id/confirm-exit')` (no
 *    body needed — entry-log.controller.ts's `confirmExit()` takes only
 *    the id + caller identity from the JWT).
 *  - This is the **only** path that ever sets `exitTime` — reiterate to
 *    whoever implements this that scanning alone must never auto-close an
 *    entry (spec 2.1, already enforced server-side, but the UI must not
 *    imply otherwise either, e.g. no "exited" state shown until this call
 *    succeeds).
 */
import { StyleSheet, Text, View } from "react-native";

export function ExitConfirmScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ยืนยันแขกออก</Text>
      <Text style={styles.todo}>
        TODO: รายการแขกที่ยังไม่ออก + ปุ่มยืนยันออก (PATCH
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
