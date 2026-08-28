/**
 * "หน้าบันทึกด้วยมือ (ไม่มี QR)" (spec 1.2) — MVP_BACKLOG.md Epic 7.
 *
 * Camera capture -> base64 `photoDataUrl`, required on this path
 * (entry-log.service.ts enforces this conditionally server-side). House
 * picker sourced from `GET /houses` (GUARD-allowed).
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api, ApiError } from "../../lib/api";
import type { House } from "../../lib/types";

export function ManualEntryScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  const [visitorName, setVisitorName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [housePickerOpen, setHousePickerOpen] = useState(false);
  const [loadingHouses, setLoadingHouses] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<House[]>("/houses")
      .then(setHouses)
      .catch(() => Alert.alert("โหลดรายชื่อบ้านไม่สำเร็จ", "ลองรีเฟรชหน้านี้อีกครั้ง"))
      .finally(() => setLoadingHouses(false));
  }, []);

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

  const selectedHouse = houses.find((h) => h.id === houseId);
  const formValid = visitorName.trim().length > 0 && !!houseId && !!photoDataUrl;

  async function handleSubmit() {
    if (!formValid || submitting) return;
    setSubmitting(true);
    try {
      await api.post("/entry-logs", {
        visitorName: visitorName.trim(),
        vehiclePlate: vehiclePlate || undefined,
        houseId,
        photoDataUrl,
      });
      Alert.alert("บันทึกสำเร็จ", visitorName.trim());
      setVisitorName("");
      setVehiclePlate("");
      setHouseId(null);
      setPhotoDataUrl(null);
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
      <Text style={styles.label}>ถ่ายรูปบัตร ปชช. / ทะเบียนรถ *</Text>
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

      <Text style={styles.label}>ชื่อแขก *</Text>
      <TextInput style={styles.input} value={visitorName} onChangeText={setVisitorName} placeholder="ชื่อ-นามสกุล" />

      <Text style={styles.label}>ทะเบียนรถ (ถ้ามี)</Text>
      <TextInput style={styles.input} value={vehiclePlate} onChangeText={setVehiclePlate} placeholder="กข 1234" />

      <Text style={styles.label}>บ้านที่ไปหา *</Text>
      {loadingHouses ? (
        <ActivityIndicator />
      ) : (
        <TouchableOpacity style={styles.input} onPress={() => setHousePickerOpen(true)}>
          <Text style={selectedHouse ? styles.houseSelected : styles.housePlaceholder}>
            {selectedHouse ? `${selectedHouse.houseNo}${selectedHouse.zone ? ` (โซน ${selectedHouse.zone})` : ""}` : "เลือกบ้าน"}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.submitButton, (!formValid || submitting) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!formValid || submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>บันทึกเข้า</Text>}
      </TouchableOpacity>

      <Modal visible={housePickerOpen} animationType="slide" onRequestClose={() => setHousePickerOpen(false)}>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={styles.modalTitle}>เลือกบ้าน</Text>
          {houses.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={styles.houseRow}
              onPress={() => {
                setHouseId(h.id);
                setHousePickerOpen(false);
              }}
            >
              <Text style={styles.houseRowText}>
                {h.houseNo}
                {h.zone ? ` (โซน ${h.zone})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.closeModal} onPress={() => setHousePickerOpen(false)}>
            <Text style={styles.closeModalText}>ปิด</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  label: { fontSize: 13, color: "#555", marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    justifyContent: "center",
  },
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
  housePlaceholder: { color: "#999" },
  houseSelected: { color: "#111" },
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
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  houseRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee" },
  houseRowText: { fontSize: 15 },
  closeModal: { marginTop: 20, alignItems: "center", padding: 12 },
  closeModalText: { color: "#999" },
});
