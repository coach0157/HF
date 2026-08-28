/**
 * "หน้าประกาศ" (spec 1.1/2.2) — MVP_BACKLOG.md Epic 6. Same feed powers the
 * Home screen's 3-item preview; this is the full list.
 *
 * Dev agent TODO:
 *  - `api.get('/announcements')` -> feed sorted by `createdAt` desc
 *    (already sorted server-side per announcement.service.ts).
 *  - Color badge per `level`: NORMAL = เทา, IMPORTANT = เหลือง,
 *    EMERGENCY = แดง (spec 1.1's exact color scheme).
 *  - Tap -> detail view (title/content/imageUrl) + fire
 *    `api.post('/announcements/:id/read')` (idempotent server-side, safe to
 *    call even if already read — see announcement.service.ts's
 *    `markRead()`).
 *  - Unread-vs-read visual distinction (bold/dot) so residents can tell
 *    what's new without opening each one.
 */
import { StyleSheet, Text, View } from "react-native";

export function AnnouncementsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ประกาศ</Text>
      <Text style={styles.todo}>
        TODO: feed จาก GET /announcements พร้อม badge สีตาม level, แตะเพื่อ
        ดูรายละเอียด + mark read (POST /announcements/:id/read) — ดู doc
        comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
