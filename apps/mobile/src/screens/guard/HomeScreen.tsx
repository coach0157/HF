/**
 * Guard home (spec 1.2 "หน้าแรก") — MVP_BACKLOG.md Epic 7.
 *
 * Dev agent TODO:
 *  - Large "สแกน QR" button, center of screen -> navigate to ScanQr.
 *  - Today's entry/exit summary count. No dedicated summary endpoint
 *    exists — compute client-side from `GET /entry-logs?date=<today>`
 *    (paginated; either page through it or flag adding a summary endpoint
 *    as a backend enhancement request, don't add it yourself this round).
 *  - Guard shift status indicator (on_duty/off_duty) sourced from
 *    `GET /guard-shifts?guardUserId=<self>` — toggling on/off duty itself
 *    isn't in spec 1.2's wireframe but is required for SOS routing to reach
 *    this guard at all (spec 2.2: only `on_duty` guards get routed SOS) —
 *    surface at least a read-only status here, with a TODO note on whether
 *    a toggle belongs on this screen or is admin-only (admin-web's
 *    GuardShiftsPage already has a toggle; product call for the Dev agent).
 */
import { StyleSheet, Text, View } from "react-native";

export function GuardHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>หน้าแรก (รปภ.)</Text>
      <Text style={styles.todo}>
        TODO: ปุ่มสแกน QR ขนาดใหญ่, สรุปจำนวนเข้า-ออกวันนี้ — ดู doc comment
        ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
