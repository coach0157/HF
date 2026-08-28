/**
 * "หน้าเพิ่มเติม / โปรไฟล์" (spec 1.1) — MVP_BACKLOG.md Epic 6.
 *
 * Dev agent TODO:
 *  - Household info: `api.get('/users/me')` for the signed-in user, plus
 *    `api.get('/houses/:id')` for `houseId` (GUARD/ADMIN-only per
 *    house.controller.ts today — flag as a backend gap if a resident needs
 *    their own house's zone/address here; `users/me` alone gives
 *    `houseId` but not house_no/zone).
 *  - Logout button: `api.post('/auth/logout', { refreshToken })` then
 *    `clearSession()` (src/lib/auth.ts) and set `AuthContext`'s session to
 *    null so `RootNavigator` swaps back to the Auth stack.
 *  - Notification settings toggle — out of scope for backend this round
 *    (no settings endpoint exists); local-only (SecureStore or
 *    AsyncStorage) preference is fine as a stub.
 */
import { StyleSheet, Text, View } from "react-native";

export function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>เพิ่มเติม</Text>
      <Text style={styles.todo}>
        TODO: ข้อมูลบ้าน (GET /users/me), ปุ่ม logout (POST /auth/logout +
        clearSession) — ดู doc comment ของไฟล์นี้
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  todo: { textAlign: "center", color: "#666" },
});
