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
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { api, ApiError } from "../../lib/api";
import type { VisitorPassScanResult } from "../../lib/types";
import { Button } from "../../components/Button";
import { colors, spacing } from "../../theme";

const STATUS_LABEL: Record<string, string> = {
  UNUSED: "ยังไม่ใช้",
  ENTERED: "เข้าแล้ว (สแกนนี้คือยืนยันออก)",
  EXITED: "ออกแล้ว",
  EXPIRED: "หมดอายุ",
  REVOKED: "ยกเลิกแล้ว",
};

export function ScanQrScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  // `useCameraPermissions()` only reads the OS permission state on mount —
  // it never notices a change made outside the app (e.g. the guard leaves
  // via "เปิดการตั้งค่า" below, grants Camera in Android Settings, then
  // returns via the tab bar rather than a full app relaunch). Re-checking
  // on every focus picks that up. Calling `requestPermission()` when
  // already granted is a no-op (resolves immediately, no dialog); when
  // still denied it's the same silent re-check Android already does for a
  // permanently-denied permission (no repeat dialog either way).
  useFocusEffect(
    useCallback(() => {
      requestPermission();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>ต้องอนุญาตใช้กล้องเพื่อสแกน QR</Text>
        <Button title="อนุญาตใช้กล้อง" onPress={requestPermission} style={styles.permissionButton} />
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
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      )}

      {scanError && (
        <View style={styles.resultPanel}>
          <Text style={styles.errorText}>{scanError}</Text>
          <Button title="สแกนใหม่" onPress={reset} style={styles.rescanButton} />
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
            <Button title="ปฏิเสธ" variant="danger" onPress={reset} style={styles.actionButton} />
            <Button
              title="ยืนยันเข้า"
              onPress={handleConfirmEntry}
              loading={confirming}
              style={styles.actionButton}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  permissionText: { textAlign: "center", marginBottom: spacing.lg, fontSize: 15, color: colors.textPrimary },
  permissionButton: { paddingHorizontal: spacing.xl },
  settingsLink: { marginTop: spacing.md, color: colors.secondary },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultPanel: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, justifyContent: "center" },
  visitorName: { fontSize: 22, fontWeight: "800", textAlign: "center", color: colors.textPrimary },
  meta: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm - 2 },
  errorText: { fontSize: 16, color: colors.danger, textAlign: "center" },
  rescanButton: { marginTop: spacing.xl },
  actionRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  actionButton: { flex: 1 },
});
