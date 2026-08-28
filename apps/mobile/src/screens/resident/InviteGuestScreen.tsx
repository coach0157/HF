/**
 * "หน้าเชิญแขก / สร้าง QR" (spec 1.1) — MVP_BACKLOG.md Epic 6.
 *
 * Dev agent TODO:
 *  - Form: ชื่อแขก (`visitorName`, required), เบอร์โทร (`visitorPhone`,
 *    optional, Thai format), ทะเบียนรถ (`vehiclePlate`, optional), ช่วงเวลา
 *    ที่อนุญาต (`validFrom`/`validTo`, ISO datetime), ประเภทการใช้งาน
 *    (`usageType`: SINGLE/MULTI) — field names match
 *    `CreateVisitorPassDto` exactly (apps/backend/src/modules/visitor-pass/
 *    dto/create-visitor-pass.dto.ts). Spec's "ประเภท (แขก/ไรเดอร์/ช่าง/
 *    แม่บ้าน)" category is cosmetic only — the DTO has no such field, don't
 *    invent a backend change for it; fold it into `visitorName` or a local
 *    UI label if wanted.
 *  - Submit -> `api.post('/visitor-passes', dto)`, on success navigate to
 *    QrDisplay with the returned pass.
 *  - Below the form: list of previously-created passes with status badge
 *    (UNUSED/ENTERED/EXITED/EXPIRED/REVOKED) — needs a `GET /visitor-passes`
 *    list endpoint; **not present in visitor-pass.controller.ts today** —
 *    flag this as a backend gap to report, don't add it yourself per this
 *    round's "ห้ามแก้ backend" constraint (D:\HF\docs\MVP_BACKLOG.md Epic 2
 *    only lists create/revoke/scan/sync-revoked, no list-by-resident).
 *  - Revoke button per row -> `api.patch('/visitor-passes/:id/revoke')`.
 */
import { StyleSheet, Text, View } from "react-native";

export function InviteGuestScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>เชิญแขก / สร้าง QR</Text>
      <Text style={styles.todo}>
        TODO: ฟอร์มสร้าง QR (POST /visitor-passes), รายการ QR ที่สร้างไว้ +
        ปุ่ม revoke — ดู doc comment ของไฟล์นี้ (มี backend gap ต้อง report:
        ยังไม่มี list-by-resident endpoint)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
