/**
 * "หน้ารับแจ้งเหตุ SOS" (spec 1.2) — MVP_BACKLOG.md Epic 7. Guard's
 * real-time incoming-emergency inbox; admin-web's SosPage
 * (apps/admin-web/src/pages/SosPage.tsx) is the read-only dashboard
 * equivalent — this screen additionally needs the acknowledge action.
 *
 * Dev agent TODO:
 *  - `api.get('/sos-alerts?status=PENDING')` (GUARD role allowed per
 *    sos.controller.ts's `list()`). admin-web's SosPage polls every 5s as
 *    its "real-time" approach — reuse that pattern here, or upgrade to a
 *    push/WebSocket delivery if implemented backend-side by then (spec
 *    2.1's Dev-agent note in entry-log flows mentions FCM push; SOS routing
 *    itself is backend-only today, see sos.service.ts — confirm before
 *    assuming a push channel exists for this screen).
 *  - Each row: house number (resolve via `GET /houses/:id` or a joined
 *    `GET /houses` list, same approach as SosPage's `houseNo()` helper),
 *    coordinates -> open in a maps app (`Linking.openURL` with a
 *    `geo:` or `https://www.google.com/maps?q=lat,lng` URL), "โทรกลับ"
 *    button -> `Linking.openURL('tel:' + phone)` (phone resolved from
 *    `triggeredByUserId` via `GET /users/:id`, ADMIN-only endpoint today —
 *    flag as a backend gap if GUARD role can't call it; check
 *    users.controller.ts before assuming).
 *  - "รับเรื่อง" (acknowledge) button ->
 *    `api.patch('/sos-alerts/:id/acknowledge')`.
 *  - Sort pending-first, most urgent/oldest-pending at top.
 */
import { StyleSheet, Text, View } from "react-native";

export function SosListScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>แจ้งเหตุ SOS</Text>
      <Text style={styles.todo}>
        TODO: รายการ SOS real-time (GET /sos-alerts) + พิกัด/เลขที่บ้าน +
        ปุ่มโทรกลับ + ปุ่มรับเรื่อง (PATCH /sos-alerts/:id/acknowledge) — ดู
        doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
