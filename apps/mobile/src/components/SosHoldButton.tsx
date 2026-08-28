/**
 * Shared "hold to confirm" SOS trigger button (spec 2.2: "ปุ่ม SOS ต้องกด
 * ค้างอย่างน้อย 2 วินาที กันกดพลาด"). Used by resident/HomeScreen.tsx.
 * Backend receives the payload only after this component has already
 * enforced the 2s hold client-side (spec: "backend รับ payload หลัง client
 * ยืนยันแล้ว" — the hold gate is a UI concern, not a server one).
 *
 * Implementation notes:
 *  - `Pressable` + `Animated.timing` drives a circular progress ring fill
 *    over `HOLD_MS`. `onPressIn` starts it; `onPressOut` before completion
 *    resets it to 0 (no fire) — enforced via the Animated listener rather
 *    than a bare `setTimeout`, so a fast release genuinely cancels instead
 *    of racing a timer.
 *  - `onTrigger()` fires once, exactly when the animation completes.
 *  - No `expo-haptics` dependency is installed; skipped as a non-required
 *    nice-to-have per the doc comment this replaces.
 */
import { useCallback, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

const HOLD_MS = 2000;

export function SosHoldButton({ onTrigger }: { onTrigger: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [holding, setHolding] = useState(false);
  const firedRef = useRef(false);

  const handlePressIn = useCallback(() => {
    firedRef.current = false;
    setHolding(true);
    progress.setValue(0);
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished && !firedRef.current) {
        firedRef.current = true;
        onTrigger();
      }
    });
  }, [onTrigger, progress]);

  const handlePressOut = useCallback(() => {
    setHolding(false);
    animRef.current?.stop();
    progress.setValue(0);
  }, [progress]);

  const fillHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel="กดค้าง 2 วินาทีเพื่อแจ้งเหตุฉุกเฉิน SOS"
      style={styles.button}
    >
      <View style={styles.fillClip}>
        <Animated.View style={[styles.fill, { height: fillHeight }]} />
      </View>
      <Text style={styles.label}>SOS</Text>
      <Text style={styles.hint}>{holding ? "ค้างไว้..." : "กดค้าง 2 วิ"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#c0392b",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    overflow: "hidden",
  },
  fillClip: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
  },
  fill: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  label: { color: "#fff", fontSize: 32, fontWeight: "800" },
  hint: { color: "#fff", fontSize: 12, textAlign: "center", marginTop: 4 },
});
