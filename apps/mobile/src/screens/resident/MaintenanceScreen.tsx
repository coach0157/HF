/**
 * "แจ้งซ่อม" list screen (spec 1.1 shortcut card / spec 2.4 — Epic 9,
 * docs/PHASE2_BACKLOG.md Epic 9). Residents are scoped to their own house's
 * tickets server-side (maintenance.service.ts's `list()`), same pattern as
 * EntryHistoryScreen.tsx. Tapping "+ แจ้งซ่อมใหม่" navigates to
 * CreateMaintenanceScreen; tapping a ticket row shows its full status.
 */
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiError } from "../../lib/api";
import type {
  MaintenanceCategory,
  MaintenanceStatus,
  MaintenanceTicket,
  Paginated,
} from "../../lib/types";
import type { ResidentTabParamList } from "../../navigation/types";
import { Button } from "../../components/Button";
import { Badge, type BadgeVariant } from "../../components/Badge";
import { colors, spacing } from "../../theme";

const CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  ELECTRICAL: "ไฟฟ้า",
  PLUMBING: "ประปา",
  ROAD: "ถนน",
  OTHER: "อื่นๆ",
};

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  OPEN: "รับเรื่อง",
  IN_PROGRESS: "กำลังดำเนินการ",
  DONE: "เสร็จสิ้น",
};

const STATUS_BADGE_VARIANT: Record<MaintenanceStatus, BadgeVariant> = {
  OPEN: "warning",
  IN_PROGRESS: "info",
  DONE: "success",
};

export function MaintenanceScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ResidentTabParamList, "Maintenance">>();
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Paginated<MaintenanceTicket>>(
        "/maintenance-tickets?pageSize=50",
      );
      setTickets(res.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดรายการแจ้งซ่อมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      <Button
        title="+ แจ้งซ่อมใหม่"
        onPress={() => navigation.navigate("CreateMaintenance")}
        style={styles.createButton}
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          !loading && !error ? <Text style={styles.empty}>ยังไม่มีรายการแจ้งซ่อม</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ticketNumber}>{item.ticketNumber}</Text>
              <Text style={styles.category}>{CATEGORY_LABEL[item.category]}</Text>
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
              {item.scheduledDate && (
                <Text style={styles.meta}>
                  นัดหมาย: {new Date(item.scheduledDate).toLocaleDateString("th-TH")}
                </Text>
              )}
              {item.assignedTo && <Text style={styles.meta}>ผู้รับผิดชอบ: {item.assignedTo}</Text>}
            </View>
            <Badge label={STATUS_LABEL[item.status]} variant={STATUS_BADGE_VARIANT[item.status]} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  createButton: { margin: spacing.lg },
  errorText: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.md + 2,
    gap: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  ticketNumber: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  category: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  description: { fontSize: 13, color: colors.textPrimary, marginTop: spacing.xs },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
});
