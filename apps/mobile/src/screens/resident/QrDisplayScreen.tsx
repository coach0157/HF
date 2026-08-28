/**
 * Full-screen QR display after creating a pass (spec 1.1 "แสดง QR Code
 * เต็มจอ + ปุ่มแชร์"). MVP_BACKLOG.md Epic 6.
 *
 * Dev agent TODO:
 *  - Render `pass.qrToken` (the signed JWT string returned by
 *    `POST /visitor-passes`, see CreateVisitorPassDto/schema.prisma's
 *    VisitorPass.qrToken) as a QR code via `react-native-qrcode-svg`
 *    (already a dependency — `import QRCode from 'react-native-qrcode-svg'`,
 *    `<QRCode value={pass.qrToken} size={280} />`).
 *  - Share button -> `expo-sharing` (not yet installed — add when
 *    implementing) to share via LINE/SMS per spec, or a plain
 *    `Share.share()` from React Native's core `Share` API as a simpler
 *    first cut.
 *  - Status badge (unused/entered/exited/expired/revoked) + validity window
 *    text, revoke button (`PATCH /visitor-passes/:id/revoke`).
 */
import { StyleSheet, Text, View } from "react-native";

export function QrDisplayScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>QR แขก</Text>
      <Text style={styles.todo}>
        TODO: แสดง QR เต็มจอจาก pass.qrToken (react-native-qrcode-svg) + ปุ่ม
        แชร์ + สถานะ + ปุ่ม revoke — ดู doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
