/**
 * "แจ้งซ่อม" create form (spec 2.4 — Epic 9, docs/PHASE2_BACKLOG.md Epic 9).
 * Category picker (ไฟฟ้า/ประปา/ถนน/อื่นๆ = `MaintenanceCategory` enum),
 * description, optional photo via `expo-camera` — same capture pattern as
 * guard/ManualEntryScreen.tsx (base64 `photoDataUrl`, full-screen CameraView
 * modal, `takePictureAsync({ base64: true })`). Unlike ManualEntryScreen's
 * ID-card photo, the photo here is optional (spec 2.4 doesn't require one).
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
import { CameraView, useCameraPermissions } from "expo-camera";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiError } from "../../lib/api";
import type { MaintenanceCategory, MaintenanceTicket } from "../../lib/types";
import type { ResidentTabParamList } from "../../navigation/types";

const CATEGORIES: { value: MaintenanceCategory; label: string; icon: string }[] = [
  { value: "ELECTRICAL", label: "ไฟฟ้า", icon: "💡" },
  { value: "PLUMBING", label: "ประปา", icon: "🚰" },
  { value: "ROAD", label: "ถนน", icon: "🛣️" },
  { value: "OTHER", label: "อื่นๆ", icon: "🔧" },
];

export function CreateMaintenanceScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ResidentTabParamList, "CreateMaintenance">>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const [category, setCategory] = useState<MaintenanceCategory>("ELECTRICAL");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const formValid = description.trim().length > 0;

  async function handleSubmit() {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await api.post<MaintenanceTicket>("/maintenance-tickets", {
        category,
        description: description.trim(),
        photoDataUrl: photoDataUrl ?? undefined,
      });
      Alert.alert("แจ้งซ่อมสำเร็จ", `เลขที่ใบงาน ${ticket.ticketNumber}`);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "แจ้งซ่อมไม่สำเร็จ");
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
      <Text style={styles.label}>หมวดหมู่ *</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c.value}
            style={[styles.chip, category === c.value && styles.chipActive]}
            onPress={() => setCategory(c.value)}
          >
            <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>
              {c.icon} {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>คำอธิบายปัญหา *</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="อธิบายปัญหาที่พบ เช่น ไฟหน้าบ้านดับ 2 วันแล้ว"
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>ถ่ายรูปแนบ (ถ้ามี)</Text>
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

      {error ? <Text style={styles.fieldError}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.submitButton, (!formValid || submitting) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!formValid || submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>แจ้งซ่อม</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  label: { fontSize: 13, color: "#555", marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 15 },
  textArea: { height: 100, textAlignVertical: "top" },
  fieldError: { color: "#c0392b", fontSize: 12, marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: "#1d6f42", borderColor: "#1d6f42" },
  chipText: { fontSize: 13, color: "#444" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  captureBox: {
    height: 140,
    borderWidth: 1,
    borderColor: "#ccc",
    borderStyle: "dashed",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  captureBoxIcon: { fontSize: 28 },
  captureBoxText: { color: "#666" },
  preview: { width: "100%", height: 180, borderRadius: 10 },
  retake: { textAlign: "center", color: "#2980b9", marginTop: 6 },
  submitButton: {
    marginTop: 24,
    backgroundColor: "#1d6f42",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cameraContainer: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  cameraControls: {
    position: "absolute",
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
  },
  cancelCameraButton: { position: "absolute", left: 24 },
  cancelCameraText: { color: "#fff", fontSize: 15 },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    borderWidth: 4,
    borderColor: "#ccc",
  },
});
