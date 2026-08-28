/**
 * Resident home (spec 1.1 "หน้าแรก") — MVP_BACKLOG.md Epic 6.
 *
 * Dev agent TODO:
 *  - Top bar: village name/logo + notification bell with unread-announcement
 *    badge (count of `GET /announcements` items where `readAt` is null).
 *  - Large red SOS button, **hold for >= 2s** before firing (spec 2.2 "กด
 *    ค้างอย่างน้อย 2 วินาที กันกดพลาด") — see components/SosHoldButton.tsx
 *    stub for where the hold-timer logic belongs. On fire:
 *    `api.post('/sos-alerts', { latitude, longitude })` (device GPS via
 *    `expo-location` — not yet installed, add it when implementing this).
 *  - Shortcut cards (scoped to MVP; spec's full 2x3 grid also lists
 *    แจ้งซ่อม/จองพื้นที่/ชำระค่าส่วนกลาง/ทำเนียบบ้าน which are OUT of scope
 *    this round per MVP_BACKLOG.md's "ไม่อยู่ใน scope" list): "เชิญแขก (QR)"
 *    -> InviteGuest, "ประวัติเข้า-ออก" -> EntryHistory.
 *  - Latest-3 announcement feed preview (`GET /announcements`, first 3 by
 *    `createdAt` desc), tapping through to the Announcements tab.
 */
import { StyleSheet, Text, View } from "react-native";

export function ResidentHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>หน้าแรก</Text>
      <Text style={styles.todo}>
        TODO: ปุ่ม SOS (กดค้าง 2 วิ), การ์ดลัด (เชิญแขก / ประวัติเข้า-ออก),
        ฟีดประกาศล่าสุด 3 รายการ — ดู doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
