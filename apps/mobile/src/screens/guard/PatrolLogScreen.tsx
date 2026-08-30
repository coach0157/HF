/**
 * "หน้าบันทึกตรวจรอบ" — Epic 12 (Guard Patrol Log, user request, not in the
 * original spec — see docs/PHASE2_BACKLOG.md §5). Free-form photo evidence
 * of a patrol pass: no fixed checkpoint list, note + GPS both optional.
 *
 * Camera capture follows ManualEntryScreen.tsx's exact pattern (base64
 * `photoDataUrl`, expo-camera). GPS follows resident HomeScreen.tsx's
 * `handleSos()` pattern: request permission silently, attach coordinates
 * only if granted, never block/alert on denial — a patrol log with no GPS
 * is still valid (CreatePatrolLogDto's latitude/longitude are optional).
 *
 * Reached from GuardHomeScreen's quick-links grid, not a bottom tab — the
 * tab bar already has 7 tabs (GuardTabNavigator.tsx), which is already
 * dense on a real phone width with Thai labels; an 8th visible tab would
 * make every label wrap/truncate. Registered as a hidden Tab.Screen
 * (`tabBarButton: () => null`) so navigation stays a plain `navigate()`
 * call like every other guard quick-link, without the risk of restructuring
 * Home into a nested stack (see GuardTabNavigator.tsx's comment on this).
 */
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { api, ApiError } from "../../lib/api";
import type { GuardTabParamList } from "../../navigation/types";
import { Button } from "../../components/Button";
import { colors, radius, spacing } from "../../theme";

export function PatrolLogScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<GuardTabParamList, "PatrolLog">>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleOpenCamera() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setCameraOpen(true);
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (photo?.base64) {
        setPhotoDataUrl(`data:image/jpeg;base64,${photo.base64}`);
      }
    } catch {
      Alert.alert("ถ่ายรูปไม่สำเร็จ", "ลองอีกครั้ง");
    } finally {
      setCameraOpen(false);
    }
  }

  const formValid = !!photoDataUrl;

  async function handleSubmit() {
    if (!formValid || submitting) return;
    setSubmitting(true);
    try {
      // GPS: optional and silent, same pattern as resident HomeScreen's
      // handleSos() — never block/alert the guard just because location
      // permission was denied or unavailable indoors.
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        }
      } catch {
        // GPS unavailable — patrol log still saves without coordinates.
      }

      await api.post("/patrol-logs", {
        photoDataUrl,
        note: note.trim() || undefined,
        latitude,
        longitude,
      });
      Alert.alert("บันทึกตรวจรอบสำเร็จ", "", [
        { text: "ตกลง", onPress: () => navigation.goBack() },
      ]);
      setPhotoDataUrl(null);
      setNote("");
    } catch (e) {
      Alert.alert("บันทึกไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  if (cameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelCameraButton} onPress={() => setCameraOpen(false)}>
            <Text style={styles.cancelCameraText}>ยกเลิก</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureButton} onPress={handleCapture} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>ถ่ายรูปหลักฐานตรวจรอบ *</Text>
      {photoDataUrl ? (
        <TouchableOpacity onPress={handleOpenCamera}>
          <Image source={{ uri: photoDataUrl }} style={styles.preview} />
          <Text style={styles.retake}>แตะเพื่อถ่ายใหม่</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.captureBox} onPress={handleOpenCamera}>
          <Text style={styles.captureBoxIcon}>📷</Text>
          <Text style={styles.captureBoxText}>ถ่ายรูป</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>หมายเหตุ (ถ้ามี)</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        value={note}
        onChangeText={setNote}
        placeholder="เช่น ตรวจรอบประตูหลังหมู่บ้าน"
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <Text style={styles.hint}>
        ระบบจะแนบเวลาและพิกัด GPS (ถ้าอนุญาต) ให้อัตโนมัติ — ไม่มีจุดตรวจตายตัว ถ่ายที่ไหนก็ได้ระหว่างเดินตรวจ
      </Text>

      <Button
        title="บันทึกตรวจรอบ"
        onPress={handleSubmit}
        disabled={!formValid}
        loading={submitting}
        style={styles.submitButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  label: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm - 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  noteInput: { minHeight: 80, textAlignVertical: "top" },
  captureBox: {
    height: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm - 2,
    backgroundColor: colors.surface,
  },
  captureBoxIcon: { fontSize: 28 },
  captureBoxText: { color: colors.textSecondary },
  preview: { width: "100%", height: 180, borderRadius: radius.card },
  retake: { textAlign: "center", color: colors.secondaryDark, marginTop: spacing.sm - 2 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.md },
  submitButton: { marginTop: spacing.xl },
  cameraContainer: { flex: 1, backgroundColor: colors.black },
  camera: { flex: 1 },
  cameraControls: {
    position: "absolute",
    bottom: spacing.xxl,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxxl - spacing.sm,
  },
  cancelCameraButton: { position: "absolute", left: spacing.xl },
  cancelCameraText: { color: colors.white, fontSize: 15 },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.white,
    borderWidth: 4,
    borderColor: colors.border,
  },
});
