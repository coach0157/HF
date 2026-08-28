/**
 * Step 2 of login. Receives `{ phone }` from PhoneLoginScreen via
 * AuthStackParamList (src/navigation/types.ts).
 *
 * Dev agent TODO:
 *  - 6-digit OTP input (matches LoginDto's `@Matches(/^\d{6}$/)`).
 *  - Call `api.post('/auth/login', { phone, otp })`
 *    (apps/backend's `AuthService.login()` returns
 *    `{ accessToken, refreshToken, user: { id, villageId, role, houseId,
 *    name, phone } }`).
 *  - Reject the response client-side if `user.role === 'ADMIN'` (this app
 *    only serves RESIDENT/GUARD — admin-web's LoginPage does the inverse
 *    check).
 *  - `await setSession(...)` (src/lib/auth.ts) with the mapped
 *    `MobileSession` shape, then update `AuthContext`'s session state so
 *    `RootNavigator` switches to ResidentApp or GuardApp based on
 *    `user.role`.
 *  - Resend-OTP affordance (re-call `POST /auth/otp/request`), respecting
 *    the backend's 5-req/60s throttle on that endpoint.
 */
import { StyleSheet, Text, View } from "react-native";
import type { RouteProp } from "@react-navigation/native";
import type { AuthStackParamList } from "../../navigation/types";

export function OtpVerifyScreen({
  route,
}: {
  route: RouteProp<AuthStackParamList, "OtpVerify">;
}) {
  const { phone } = route.params;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ยืนยัน OTP</Text>
      <Text style={styles.todo}>
        TODO: กรอก OTP 6 หลักที่ส่งไปเบอร์ {phone} → เรียก POST /auth/login →
        เก็บ session (SecureStore) → เข้าแอปตาม role — ดู doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
