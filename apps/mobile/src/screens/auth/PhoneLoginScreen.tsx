/**
 * Step 1 of login (spec 3.3 `POST /auth/login`, split backend-side into
 * `POST /auth/otp/request` + `POST /auth/login` — see
 * apps/backend/src/modules/auth/auth.controller.ts's doc comment).
 * Shared entry point for both Resident and Guard — role is determined by
 * the JWT the backend returns after OTP verify, not chosen here.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { api, ApiError } from "../../lib/api";
import type { AuthStackParamList } from "../../navigation/types";

const PHONE_RE = /^0\d{9}$/;

export function PhoneLoginScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, "PhoneLogin">>();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = PHONE_RE.test(phone);

  async function handleSubmit() {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.post<void>("/auth/otp/request", { phone });
      navigation.navigate("OtpVerify", { phone });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ส่ง OTP ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>เข้าสู่ระบบ</Text>
      <Text style={styles.subtitle}>ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน</Text>

      <Text style={styles.fieldLabel}>เบอร์โทรศัพท์</Text>
      <TextInput
        style={styles.input}
        placeholder="0812345678"
        keyboardType="phone-pad"
        maxLength={10}
        value={phone}
        onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ""))}
        editable={!loading}
        autoFocus
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, (!valid || loading) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!valid || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>ขอรหัส OTP</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  subtitle: { textAlign: "center", color: "#666", marginTop: 4, marginBottom: 32 },
  fieldLabel: { fontSize: 13, color: "#444", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    letterSpacing: 1,
  },
  error: { color: "#c0392b", marginTop: 12, textAlign: "center" },
  button: {
    backgroundColor: "#1d6f42",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
