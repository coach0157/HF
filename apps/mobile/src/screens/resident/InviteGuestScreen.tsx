/**
 * "หน้าเชิญแขก / สร้าง QR" (spec 1.1) — MVP_BACKLOG.md Epic 6.
 *
 * Form fields match `CreateVisitorPassDto` exactly (visitorName,
 * visitorPhone?, vehiclePlate?, validFrom, validTo, usageType). Spec's
 * "ประเภท (แขก/ไรเดอร์/ช่าง/แม่บ้าน)" category has no backend field — folded
 * into a local-only label prefix on visitorName if the user picks one,
 * per the original doc comment's guidance not to invent a DTO field.
 *
 * List of previously-created passes now backed by `GET /visitor-passes`
 * (added by the previous dev-agent round — visitor-pass.controller.ts's
 * `list()`, resident-scoped to the caller's own passes server-side).
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiError } from "../../lib/api";
import type { Paginated, VisitorPass, VisitorPassUsageType } from "../../lib/types";
import type { ResidentTabParamList } from "../../navigation/types";

const PHONE_RE = /^0\d{9}$/;

const STATUS_LABEL: Record<VisitorPass["status"], string> = {
  UNUSED: "ยังไม่ใช้",
  ENTERED: "เข้าแล้ว",
  EXITED: "ออกแล้ว",
  EXPIRED: "หมดอายุ",
  REVOKED: "ยกเลิกแล้ว",
};
const STATUS_COLOR: Record<VisitorPass["status"], string> = {
  UNUSED: "#2980b9",
  ENTERED: "#27ae60",
  EXITED: "#7f8c8d",
  EXPIRED: "#bdc3c7",
  REVOKED: "#c0392b",
};

const CATEGORIES = ["แขก", "ไรเดอร์", "ช่าง", "แม่บ้าน"] as const;

function toIsoInHours(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
}

export function InviteGuestScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ResidentTabParamList, "InviteGuest">>();

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("แขก");
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [usageType, setUsageType] = useState<VisitorPassUsageType>("SINGLE");
  const [validHours, setValidHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [passes, setPasses] = useState<VisitorPass[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadPasses = useCallback(async () => {
    try {
      const res = await api.get<Paginated<VisitorPass>>("/visitor-passes?page=1&pageSize=50");
      setPasses(res.items);
    } catch {
      // Keep whatever list was already shown; the form itself still works.
    } finally {
      setLoadingList(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPasses();
    }, [loadPasses]),
  );

  const nameValid = visitorName.trim().length > 0;
  const phoneValid = visitorPhone.length === 0 || PHONE_RE.test(visitorPhone);
  const formValid = nameValid && phoneValid;

  async function handleCreate() {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const dto = {
        visitorName: `${category !== "แขก" ? `[${category}] ` : ""}${visitorName.trim()}`,
        visitorPhone: visitorPhone || undefined,
        vehiclePlate: vehiclePlate || undefined,
        validFrom: new Date().toISOString(),
        validTo: toIsoInHours(validHours),
        usageType,
      };
      const pass = await api.post<VisitorPass>("/visitor-passes", dto);
      setVisitorName("");
      setVisitorPhone("");
      setVehiclePlate("");
      loadPasses();
      navigation.navigate("QrDisplay", { pass });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "สร้าง QR ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(pass: VisitorPass) {
    Alert.alert("ยกเลิก QR นี้?", `${pass.visitorName}`, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ยืนยันยกเลิก",
        style: "destructive",
        onPress: async () => {
          try {
            await api.patch(`/visitor-passes/${pass.id}/revoke`);
            loadPasses();
          } catch (e) {
            Alert.alert("ยกเลิกไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
          }
        },
      },
    ]);
  }

  return (
    <FlatList
      style={styles.container}
      data={passes}
      keyExtractor={(p) => p.id}
      refreshControl={<RefreshControl refreshing={loadingList} onRefresh={loadPasses} />}
      ListHeaderComponent={
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>สร้าง QR เชิญแขก</Text>

          <Text style={styles.label}>ประเภท</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>ชื่อแขก *</Text>
          <TextInput style={styles.input} value={visitorName} onChangeText={setVisitorName} placeholder="ชื่อ-นามสกุล" />

          <Text style={styles.label}>เบอร์โทร (ถ้ามี)</Text>
          <TextInput
            style={styles.input}
            value={visitorPhone}
            onChangeText={(t) => setVisitorPhone(t.replace(/[^0-9]/g, ""))}
            placeholder="0812345678"
            keyboardType="phone-pad"
            maxLength={10}
          />
          {!phoneValid && <Text style={styles.fieldError}>รูปแบบเบอร์โทรไม่ถูกต้อง</Text>}

          <Text style={styles.label}>ทะเบียนรถ (ถ้ามี)</Text>
          <TextInput style={styles.input} value={vehiclePlate} onChangeText={setVehiclePlate} placeholder="กข 1234" />

          <Text style={styles.label}>ใช้ได้ภายใน</Text>
          <View style={styles.chipRow}>
            {[
              { label: "6 ชม.", hours: 6 },
              { label: "24 ชม.", hours: 24 },
              { label: "3 วัน", hours: 72 },
              { label: "7 วัน", hours: 168 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.hours}
                style={[styles.chip, validHours === opt.hours && styles.chipActive]}
                onPress={() => setValidHours(opt.hours)}
              >
                <Text style={[styles.chipText, validHours === opt.hours && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>รูปแบบการใช้งาน</Text>
          <View style={styles.chipRow}>
            {(["SINGLE", "MULTI"] as VisitorPassUsageType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, usageType === t && styles.chipActive]}
                onPress={() => setUsageType(t)}
              >
                <Text style={[styles.chipText, usageType === t && styles.chipTextActive]}>
                  {t === "SINGLE" ? "ใช้ครั้งเดียว" : "ใช้ได้หลายครั้ง"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? <Text style={styles.fieldError}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitButton, (!formValid || submitting) && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={!formValid || submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>สร้าง QR</Text>}
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>QR ที่สร้างไว้</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("QrDisplay", { pass: item })}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{item.visitorName}</Text>
            <Text style={styles.rowMeta}>
              {new Date(item.validFrom).toLocaleDateString("th-TH")} - {new Date(item.validTo).toLocaleDateString("th-TH")}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[item.status] }]}>
            <Text style={styles.statusText}>{STATUS_LABEL[item.status]}</Text>
          </View>
          {(item.status === "UNUSED" || item.status === "ENTERED") && (
            <TouchableOpacity style={styles.revokeButton} onPress={() => handleRevoke(item)}>
              <Text style={styles.revokeText}>ยกเลิก</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      )}
      ListEmptyComponent={!loadingList ? <Text style={styles.empty}>ยังไม่มี QR ที่สร้างไว้</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  form: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  label: { fontSize: 13, color: "#555", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  fieldError: { color: "#c0392b", fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: "#1d6f42", borderColor: "#1d6f42" },
  chipText: { fontSize: 13, color: "#444" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  submitButton: {
    backgroundColor: "#1d6f42",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    gap: 8,
  },
  rowName: { fontSize: 14, fontWeight: "600" },
  rowMeta: { fontSize: 11, color: "#999", marginTop: 2 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  revokeButton: { paddingHorizontal: 8, paddingVertical: 4 },
  revokeText: { color: "#c0392b", fontSize: 12, fontWeight: "600" },
  empty: { color: "#999", textAlign: "center", padding: 24 },
});
