/**
 * Step 2 of login. Receives `{ phone }` from PhoneLoginScreen via
 * AuthStackParamList (src/navigation/types.ts).
 *
 * On success: rejects an ADMIN-role response (this app only serves
 * RESIDENT/GUARD — admin-web's LoginPage does the inverse check), persists
 * the session via `setSession()` (SecureStore) and updates AuthContext so
 * `RootNavigator` swaps to ResidentApp/GuardApp.
 */
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { RouteProp } from "@react-navigation/native";
import type { AuthStackParamList } from "../../navigation/types";
import { api, ApiError } from "../../lib/api";
import { setSession } from "../../lib/auth";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";
import { colors, radius, spacing } from "../../theme";

const OTP_RE = /^\d{6}$/;
const RESEND_COOLDOWN_S = 60;

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    phone: string;
    role: "RESIDENT" | "GUARD" | "ADMIN";
    villageId: string;
    houseId: string | null;
  };
}

export function OtpVerifyScreen({
  route,
}: {
  route: RouteProp<AuthStackParamList, "OtpVerify">;
}) {
  const { phone } = route.params;
  const { setSession: setContextSession } = useAuth();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S);
    timerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
    try {
      await api.post<void>("/auth/otp/request", { phone });
      startCooldown();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ส่ง OTP ซ้ำไม่สำเร็จ");
    }
  }

  async function handleSubmit() {
    if (!OTP_RE.test(otp) || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<LoginResponse>("/auth/login", { phone, otp });
      if (res.user.role === "ADMIN") {
        setError("บัญชีนี้เป็นผู้ดูแลระบบ กรุณาใช้เว็บแอดมินแทน");
        return;
      }
      const session = {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        role: res.user.role as "RESIDENT" | "GUARD",
        villageId: res.user.villageId,
        userId: res.user.id,
        houseId: res.user.houseId,
        name: res.user.name,
        phone: res.user.phone,
      };
      await setSession(session);
      setContextSession(session);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ยืนยัน OTP ไม่สำเร็จ ลองใหม่อีกครั้ง");
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
        <Text style={styles.heroIcon}>🔐</Text>
      </View>
      <Text style={styles.title}>ยืนยัน OTP</Text>
      <Text style={styles.subtitle}>กรอกรหัส 6 หลักที่ส่งไปยังเบอร์ {phone}</Text>

      <TextInput
        style={styles.input}
        placeholder="000000"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={6}
        value={otp}
        onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, ""))}
        editable={!loading}
        autoFocus
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title="ยืนยัน"
        onPress={handleSubmit}
        disabled={!OTP_RE.test(otp)}
        loading={loading}
        style={styles.button}
      />

      <TouchableOpacity style={styles.resend} onPress={handleResend} disabled={cooldown > 0}>
        <Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>
          {cooldown > 0 ? `ส่งรหัสอีกครั้งใน ${cooldown} วินาที` : "ส่งรหัส OTP อีกครั้ง"}
        </Text>
      </TouchableOpacity>
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
    backgroundColor: colors.secondaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  heroIcon: { fontSize: 32 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center", color: colors.textPrimary },
  subtitle: { textAlign: "center", color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xxl },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: spacing.md + 2,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: "center" },
  button: { marginTop: spacing.xl },
  resend: { marginTop: spacing.lg, alignItems: "center" },
  resendText: { color: colors.primaryDark, fontSize: 14 },
  resendDisabled: { color: colors.textMuted },
});
