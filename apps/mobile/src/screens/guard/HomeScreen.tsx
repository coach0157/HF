/**
 * Guard home (spec 1.2 "หน้าแรก") — MVP_BACKLOG.md Epic 7.
 *
 * Today's entry/exit summary: no dedicated summary endpoint exists, so this
 * computes from two cheap `GET /entry-logs?date=<today>` calls — entry count
 * uses the accurate server-side `total` (no filter), exit count uses the
 * new `exited=true` server-side filter's `total` (QA fix — previously an
 * approximation over one pageSize=100 page's client-side filter, which
 * undercounted once a day's traffic passed 100 rows). `pageSize=1` on both
 * calls keeps the payload tiny since only `total` is used, never `items`.
 *
 * Guard shift status: previously local-state-only (no way for a GUARD
 * caller to read their own shift — `GET /guard-shifts` list is ADMIN-only),
 * so relaunching the app mid-shift showed "ยังไม่เริ่มเวร" even while truly
 * on duty, and tapping the toggle could then race a duplicate
 * `POST /guard-shifts` against the still-open server-side shift (400 "This
 * guard already has an open shift"). QA fix: `GET /guard-shifts/me/current`
 * (guard-shift.controller.ts, GUARD-only, self-scoped) is now called on
 * every focus to sync `onDuty`/`shiftId` with the real server state before
 * the guard can toggle it. Response is `{ shift: GuardShift | null }` (not
 * a bare value — a raw `null`/`undefined` controller return doesn't
 * round-trip as JSON `null` over Nest/Express, see the controller's doc
 * comment).
 */
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiError } from "../../lib/api";
import type { EntryLog, GuardShift, Paginated } from "../../lib/types";
import type { GuardTabParamList } from "../../navigation/types";
import { colors, radius, spacing } from "../../theme";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GuardHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<GuardTabParamList, "Home">>();
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [exitCount, setExitCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [onDuty, setOnDuty] = useState(false);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftSynced, setShiftSynced] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entryRes, exitRes, currentShiftRes] = await Promise.all([
        api.get<Paginated<EntryLog>>(`/entry-logs?date=${todayIso()}&pageSize=1`),
        api.get<Paginated<EntryLog>>(`/entry-logs?date=${todayIso()}&exited=true&pageSize=1`),
        api.get<{ shift: GuardShift | null }>("/guard-shifts/me/current"),
      ]);
      setEntryCount(entryRes.total);
      setExitCount(exitRes.total);
      setOnDuty(!!currentShiftRes.shift);
      setShiftId(currentShiftRes.shift?.id ?? null);
      setShiftSynced(true);
    } catch {
      // Non-blocking — the scan button still works without a summary. Shift
      // toggle stays disabled below until a sync succeeds, so a stale/wrong
      // on/off-duty state is never shown or actionable.
      setShiftSynced(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleToggleShift() {
    setShiftBusy(true);
    try {
      if (!onDuty) {
        const shift = await api.post<{ id: string }>("/guard-shifts", {});
        setShiftId(shift.id);
        setOnDuty(true);
      } else if (shiftId) {
        await api.patch(`/guard-shifts/${shiftId}`);
        setOnDuty(false);
        setShiftId(null);
      }
    } catch (e) {
      Alert.alert("ทำรายการไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
      // The toggle attempt may have raced actual server state (e.g. another
      // device already started/ended this guard's shift) — re-sync rather
      // than trust the optimistic local value after a failure.
      load();
    } finally {
      setShiftBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      contentContainerStyle={styles.content}
    >
      <View style={styles.shiftRow}>
        <View style={[styles.dot, { backgroundColor: onDuty ? colors.primary : colors.textMuted }]} />
        <Text style={styles.shiftLabel}>
          {!shiftSynced && loading ? "กำลังซิงค์สถานะเวร..." : onDuty ? "กำลังปฏิบัติหน้าที่" : "ยังไม่เริ่มเวร"}
        </Text>
        <TouchableOpacity
          style={styles.shiftButton}
          onPress={handleToggleShift}
          disabled={shiftBusy || !shiftSynced}
        >
          {shiftBusy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.shiftButtonText}>{onDuty ? "เลิกเวร" : "เริ่มเวร"}</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.scanButton} onPress={() => navigation.navigate("ScanQr")}>
        <Text style={styles.scanIcon}>📷</Text>
        <Text style={styles.scanLabel}>สแกน QR</Text>
      </TouchableOpacity>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{loading && entryCount === null ? "-" : entryCount}</Text>
          <Text style={styles.summaryLabel}>เข้าวันนี้</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{loading && exitCount === null ? "-" : exitCount}</Text>
          <Text style={styles.summaryLabel}>ออกวันนี้</Text>
        </View>
      </View>

      <View style={styles.quickLinks}>
        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate("ManualEntry")}>
          <Text style={styles.linkText}>บันทึกด้วยมือ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate("ExitConfirm")}>
          <Text style={styles.linkText}>ยืนยันแขกออก</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate("SosList")}>
          <Text style={styles.linkText}>แจ้งเหตุ SOS</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { alignItems: "center", padding: spacing.xl },
  shiftRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", gap: spacing.sm, marginBottom: spacing.xl },
  dot: { width: 10, height: 10, borderRadius: 5 },
  shiftLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  shiftButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.button - 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
  },
  shiftButtonText: { color: colors.primary, fontWeight: "600", fontSize: 12 },
  scanButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.md,
  },
  scanIcon: { fontSize: 48 },
  scanLabel: { color: colors.white, fontSize: 20, fontWeight: "800", marginTop: spacing.xs },
  summaryRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xxl - spacing.xs },
  summaryCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.lg,
    minWidth: 100,
  },
  summaryValue: { fontSize: 28, fontWeight: "800", color: colors.primaryDark },
  summaryLabel: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  quickLinks: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm + 2, marginTop: spacing.xxl, justifyContent: "center" },
  linkButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  linkText: { fontSize: 13, color: colors.textPrimary },
});
