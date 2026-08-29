/**
 * Step 1 of login (spec 3.3 `POST /auth/login`, split backend-side into
 * `POST /auth/otp/request` + `POST /auth/login` — see
 * apps/backend/src/modules/auth/auth.controller.ts's doc comment).
 * Shared entry point for both Resident and Guard — role is determined by
 * the JWT the backend returns after OTP verify, not chosen here.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { api, ApiError } from "../../lib/api";
import type { AuthStackParamList } from "../../navigation/types";
import { Button } from "../../components/Button";
import { colors, radius, spacing } from "../../theme";

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
      <View style={styles.heroIconWrap}>
        <Text style={styles.heroIcon}>🏘️</Text>
      </View>
      <Text style={styles.title}>เข้าสู่ระบบ</Text>
      <Text style={styles.subtitle}>ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน</Text>

      <Text style={styles.fieldLabel}>เบอร์โทรศัพท์</Text>
      <TextInput
        style={styles.input}
        placeholder="0812345678"
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
        maxLength={10}
        value={phone}
        onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ""))}
        editable={!loading}
        autoFocus
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title="ขอรหัส OTP"
        onPress={handleSubmit}
        disabled={!valid}
        loading={loading}
        style={styles.button}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: spacing.xl, backgroundColor: colors.background },
  heroIconWrap: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  heroIcon: { fontSize: 32 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center", color: colors.textPrimary },
  subtitle: { textAlign: "center", color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xxl },
  fieldLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm - 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: spacing.md + 2,
    fontSize: 18,
    letterSpacing: 1,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: "center" },
  button: { marginTop: spacing.xl },
});
