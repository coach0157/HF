/**
 * "หน้าสแกน" (spec 1.2) — MVP_BACKLOG.md Epic 7. The core Guard flow.
 *
 * Dev agent TODO:
 *  - Camera view via `expo-camera`'s `CameraView` (already a dependency,
 *    SDK 57's built-in barcode scanning —
 *    `<CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
 *    onBarcodeScanned={...} />`; per AGENTS.md, verify the exact current
 *    API against https://docs.expo.dev/versions/v57.0.0/sdk/camera/ before
 *    coding, Expo camera APIs have moved around across SDKs).
 *  - Request camera permission via `useCameraPermissions()` from
 *    `expo-camera` first; show a permission-request UI if not granted.
 *  - On scan: `api.get('/visitor-passes/:token')` (token = scanned QR
 *    string = `pass.qrToken`) -> renders `VisitorPassScanResult`
 *    (`{ pass, host }`, src/lib/types.ts) with visitor name, phone, plate,
 *    validity, host name + house number.
 *  - Two action buttons: "ยืนยันเข้า" -> `api.post('/entry-logs', { qrToken })`
 *    (CreateEntryLogDto's QR path — visitor/house fields come from the
 *    resolved pass server-side, don't send them); "ปฏิเสธ" -> just discard,
 *    no reject/deny endpoint exists in entry-log.controller.ts (nothing to
 *    call — a rejected scan simply doesn't create an entry log).
 *  - Handle scan errors (expired/revoked/already-used token) — the GET
 *    call will throw an ApiError; surface its message directly, it's
 *    already human-readable (see visitor-pass.service.ts's rejection
 *    messages).
 *  - Optional gate/face photo: `photoDataUrl` (base64) on the
 *    `POST /entry-logs` call, via `expo-camera`'s `takePictureAsync()`.
 */
import { StyleSheet, Text, View } from "react-native";

export function ScanQrScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>สแกน QR</Text>
      <Text style={styles.todo}>
        TODO: กล้องสแกน QR (expo-camera CameraView) → GET
        /visitor-passes/:token → ปุ่มยืนยันเข้า (POST /entry-logs) / ปฏิเสธ —
        ดู doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
