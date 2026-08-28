/**
 * "หน้าสแกน" (spec 1.2) — MVP_BACKLOG.md Epic 7. The core Guard flow.
 *
 * `CameraView`'s built-in barcode scanning (expo-camera SDK 57, verified
 * against the installed package's .d.ts — `barcodeScannerSettings` +
 * `onBarcodeScanned`, see node_modules/expo-camera/build/Camera.types.d.ts).
 * `onBarcodeScanned` fires repeatedly while a code stays in frame, so a
 * `scanned` ref gates it to one fetch per code until the guard taps
 * "สแกนใหม่".
 */
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { api, ApiError } from "../../lib/api";
import type { VisitorPassScanResult } from "../../lib/types";

const STATUS_LABEL: Record<string, string> = {
  UNUSED: "ยังไม่ใช้",
  ENTERED: "เข้าแล้ว (สแกนนี้คือยืนยันออก)",
  EXITED: "ออกแล้ว",
  EXPIRED: "หมดอายุ",
  REVOKED: "ยกเลิกแล้ว",
};

export function ScanQrScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const [result, setResult] = useState<VisitorPassScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleBarcodeScanned = useCallback(async ({ data }: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setLoading(true);
    setScanError(null);
    setResult(null);
    try {
      const res = await api.get<VisitorPassScanResult>(`/visitor-passes/${encodeURIComponent(data)}`);
      setResult(res);
    } catch (e) {
      setScanError(e instanceof ApiError ? e.message : "อ่าน QR ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  function reset() {
    scannedRef.current = false;
    setResult(null);
    setScanError(null);
  }

  async function handleConfirmEntry() {
    if (!result || confirming) return;
    setConfirming(true);
    try {
      await api.post("/entry-logs", { qrToken: result.pass.qrToken });
      Alert.alert("บันทึกการเข้าแล้ว", result.pass.visitorName, [{ text: "ตกลง", onPress: reset }]);
    } catch (e) {
      Alert.alert("บันทึกไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
    } finally {
      setConfirming(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>ต้องอนุญาตใช้กล้องเพื่อสแกน QR</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>อนุญาตใช้กล้อง</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openSettings()}>
          <Text style={styles.settingsLink}>เปิดการตั้งค่า</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!result && !scanError && (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={loading ? undefined : handleBarcodeScanned}
        />
      )}

      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {scanError && (
        <View style={styles.resultPanel}>
          <Text style={styles.errorText}>{scanError}</Text>
          <TouchableOpacity style={styles.rescanButton} onPress={reset}>
            <Text style={styles.rescanText}>สแกนใหม่</Text>
          </TouchableOpacity>
        </View>
      )}

      {result && (
        <View style={styles.resultPanel}>
          <Text style={styles.visitorName}>{result.pass.visitorName}</Text>
          {result.pass.visitorPhone ? <Text style={styles.meta}>โทร: {result.pass.visitorPhone}</Text> : null}
          {result.pass.vehiclePlate ? <Text style={styles.meta}>ทะเบียน: {result.pass.vehiclePlate}</Text> : null}
          <Text style={styles.meta}>สถานะ: {STATUS_LABEL[result.pass.status] ?? result.pass.status}</Text>
          <Text style={styles.meta}>
            ใช้ได้ถึง: {new Date(result.pass.validTo).toLocaleString("th-TH")}
          </Text>
          {result.host && (
            <Text style={styles.meta}>
              เจ้าของบ้าน: {result.host.name} (บ้านเลขที่ {result.host.houseNo ?? "-"})
            </Text>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.rejectButton} onPress={reset}>
              <Text style={styles.rejectText}>ปฏิเสธ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmEntry} disabled={confirming}>
              {confirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>ยืนยันเข้า</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  permissionText: { textAlign: "center", marginBottom: 16, fontSize: 15 },
  permissionButton: { backgroundColor: "#1d6f42", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  permissionButtonText: { color: "#fff", fontWeight: "700" },
  settingsLink: { marginTop: 12, color: "#2980b9" },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultPanel: { flex: 1, backgroundColor: "#fff", padding: 24, justifyContent: "center" },
  visitorName: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  meta: { fontSize: 14, color: "#555", textAlign: "center", marginTop: 6 },
  errorText: { fontSize: 16, color: "#c0392b", textAlign: "center" },
  rescanButton: {
    marginTop: 20,
    backgroundColor: "#1d6f42",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  rescanText: { color: "#fff", fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  rejectButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#c0392b",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  rejectText: { color: "#c0392b", fontWeight: "700" },
  confirmButton: { flex: 1, backgroundColor: "#1d6f42", borderRadius: 10, padding: 14, alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "700" },
});
