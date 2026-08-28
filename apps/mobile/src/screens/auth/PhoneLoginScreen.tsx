/**
 * Step 1 of login (spec 3.3 `POST /auth/login`, split backend-side into
 * `POST /auth/otp/request` + `POST /auth/login` — see
 * apps/backend/src/modules/auth/auth.controller.ts's doc comment).
 * Shared entry point for both Resident and Guard — role is determined by
 * the JWT the backend returns after OTP verify, not chosen here.
 *
 * Dev agent TODO:
 *  - Phone number input (Thai format `0XXXXXXXXX`, matches
 *    RequestOtpDto/LoginDto's `@Matches(/^0\d{9}$/)`).
 *  - Call `api.post('/auth/otp/request', { phone })` (src/lib/api.ts).
 *  - Handle the 409 "multiple villages for this phone" case
 *    (LoginDto's `villageId` disambiguation — see login.dto.ts's doc
 *    comment) if/when that's hit; MVP can assume single-village per phone
 *    and surface the 409 as an error for now.
 *  - Navigate to OtpVerify with `{ phone }` on success.
 */
import { StyleSheet, Text, View } from "react-native";

export function PhoneLoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>เข้าสู่ระบบ</Text>
      <Text style={styles.todo}>
        TODO: กรอกเบอร์โทร (0XXXXXXXXX) → เรียก POST /auth/otp/request → ไปหน้า
        OtpVerify — ดู doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
