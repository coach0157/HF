/**
 * Full-screen QR display after creating (or reopening) a pass (spec 1.1
 * "แสดง QR Code เต็มจอ + ปุ่มแชร์"). MVP_BACKLOG.md Epic 6.
 *
 * Takes the full `VisitorPass` via route params (see navigation/types.ts's
 * doc comment on why — there is no resident-callable "get one pass"
 * endpoint). Share uses React Native core's `Share.share()` as the simple
 * first cut noted in the original doc comment (`expo-sharing` is not a
 * listed dependency, so not added just for this).
 */
import { useState } from "react";
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import QRCode from "react-native-qrcode-svg";
import { api, ApiError } from "../../lib/api";
import type { VisitorPass } from "../../lib/types";
import type { ResidentTabParamList } from "../../navigation/types";

const STATUS_LABEL: Record<VisitorPass["status"], string> = {
  UNUSED: "ยังไม่ใช้",
  ENTERED: "เข้าแล้ว",
  EXITED: "ออกแล้ว",
  EXPIRED: "หมดอายุ",
  REVOKED: "ยกเลิกแล้ว",
};

export function QrDisplayScreen({
  route,
}: {
  route: RouteProp<ResidentTabParamList, "QrDisplay">;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<ResidentTabParamList, "QrDisplay">>();
  const [pass, setPass] = useState<VisitorPass>(route.params.pass);
  const [revoking, setRevoking] = useState(false);

  const canRevoke = pass.status === "UNUSED" || pass.status === "ENTERED";

  async function handleShare() {
    try {
      await Share.share({
        message: `เชิญเข้าหมู่บ้าน: ${pass.visitorName}\nรหัส QR: ${pass.qrToken}\nใช้ได้ถึง: ${new Date(
          pass.validTo,
        ).toLocaleString("th-TH")}`,
      });
    } catch {
      // Share sheet dismissed/cancelled — nothing to do.
    }
  }

  function handleRevoke() {
    Alert.alert("ยกเลิก QR นี้?", pass.visitorName, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ยืนยันยกเลิก",
        style: "destructive",
        onPress: async () => {
          setRevoking(true);
          try {
            const updated = await api.patch<VisitorPass>(`/visitor-passes/${pass.id}/revoke`);
            setPass(updated);
          } catch (e) {
            Alert.alert("ยกเลิกไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
          } finally {
            setRevoking(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.qrWrap}>
        <QRCode value={pass.qrToken} size={260} />
      </View>

      <Text style={styles.visitorName}>{pass.visitorName}</Text>
      {pass.visitorPhone ? <Text style={styles.meta}>โทร: {pass.visitorPhone}</Text> : null}
      {pass.vehiclePlate ? <Text style={styles.meta}>ทะเบียนรถ: {pass.vehiclePlate}</Text> : null}
      <Text style={styles.meta}>
        ใช้ได้: {new Date(pass.validFrom).toLocaleString("th-TH")} ถึง{" "}
        {new Date(pass.validTo).toLocaleString("th-TH")}
      </Text>
      <Text style={styles.meta}>{pass.usageType === "SINGLE" ? "ใช้ครั้งเดียว" : "ใช้ได้หลายครั้ง"}</Text>

      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>{STATUS_LABEL[pass.status]}</Text>
      </View>

      <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
        <Text style={styles.shareText}>แชร์ QR</Text>
      </TouchableOpacity>

      {canRevoke && (
        <TouchableOpacity style={styles.revokeButton} onPress={handleRevoke} disabled={revoking}>
          <Text style={styles.revokeText}>{revoking ? "กำลังยกเลิก..." : "ยกเลิก QR นี้"}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.doneButton}
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("InviteGuest"))}
      >
        <Text style={styles.doneText}>เสร็จสิ้น</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", padding: 24, backgroundColor: "#fff" },
  qrWrap: { marginTop: 24, marginBottom: 20, padding: 16, backgroundColor: "#fff" },
  visitorName: { fontSize: 20, fontWeight: "700" },
  meta: { fontSize: 13, color: "#666", marginTop: 4, textAlign: "center" },
  statusBadge: {
    marginTop: 12,
    backgroundColor: "#2980b9",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusText: { color: "#fff", fontWeight: "600" },
  shareButton: {
    marginTop: 24,
    backgroundColor: "#1d6f42",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  shareText: { color: "#fff", fontWeight: "700" },
  revokeButton: { marginTop: 12, paddingVertical: 10 },
  revokeText: { color: "#c0392b", fontWeight: "600" },
  doneButton: { marginTop: 20, paddingVertical: 10 },
  doneText: { color: "#999" },
});
