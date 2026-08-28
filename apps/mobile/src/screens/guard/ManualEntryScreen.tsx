/**
 * "หน้าบันทึกด้วยมือ (ไม่มี QR)" (spec 1.2) — MVP_BACKLOG.md Epic 7.
 *
 * Dev agent TODO:
 *  - Form: ชื่อแขก (`visitorName`, required for this path), ทะเบียนรถ
 *    (`vehiclePlate`, optional), เลือกบ้าน (`houseId`, required — picker
 *    sourced from `GET /houses`, GUARD-role allowed per
 *    house.controller.ts).
 *  - Camera capture -> base64 `photoDataUrl` — **required** on the manual
 *    path (entry-log.service.ts enforces this conditionally server-side;
 *    the QR path treats it as optional). Use `expo-camera`'s
 *    `takePictureAsync({ base64: true })`.
 *  - Submit -> `api.post('/entry-logs', { visitorName, vehiclePlate,
 *    houseId, photoDataUrl })` (no `qrToken` field — that's what
 *    disambiguates manual vs. QR path server-side, see
 *    CreateEntryLogDto's doc comment).
 *  - This photo goes to the sensitive-data bucket
 *    (`S3_BUCKET_SENSITIVE_ID`, 90-day auto-delete per spec 3.4) — no
 *    client-side implication, just don't assume it behaves like the QR
 *    path's optional gate photo.
 */
import { StyleSheet, Text, View } from "react-native";

export function ManualEntryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>บันทึกด้วยมือ (ไม่มี QR)</Text>
      <Text style={styles.todo}>
        TODO: ถ่ายรูปบัตร/ทะเบียน + กรอกข้อมูล → POST /entry-logs (ไม่มี
        qrToken) — ดู doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
