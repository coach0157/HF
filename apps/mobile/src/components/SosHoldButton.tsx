/**
 * Shared "hold to confirm" SOS trigger button (spec 2.2: "ปุ่ม SOS ต้องกด
 * ค้างอย่างน้อย 2 วินาที กันกดพลาด"). Used by resident/HomeScreen.tsx.
 * Backend receives the payload only after this component has already
 * enforced the 2s hold client-side (spec: "backend รับ payload หลัง client
 * ยืนยันแล้ว" — the hold gate is a UI concern, not a server one).
 *
 * Dev agent TODO:
 *  - `Pressable` with `onPressIn` starting a `setTimeout(..., 2000)` and
 *    `onPressOut` clearing it if released early (no fire).
 *  - Visual progress feedback during the hold (e.g. an animated fill/ring)
 *    so the user knows it's counting down, not just unresponsive.
 *  - On successful 2s hold: call `onTrigger()` prop (parent wires this to
 *    `api.post('/sos-alerts', { latitude, longitude })`, with GPS from
 *    `expo-location` — add that dependency when implementing).
 *  - Haptic feedback on trigger via `expo-haptics` (nice-to-have, not
 *    required).
 */
import { StyleSheet, Text, View } from "react-native";

export function SosHoldButton({ onTrigger: _onTrigger }: { onTrigger: () => void }) {
  return (
    <View style={styles.button}>
      <Text style={styles.label}>SOS</Text>
      <Text style={styles.todo}>TODO: hold 2s to trigger — see doc comment</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#c0392b",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  label: { color: "#fff", fontSize: 28, fontWeight: "800" },
  todo: { color: "#fff", fontSize: 10, textAlign: "center", marginTop: 4 },
});
