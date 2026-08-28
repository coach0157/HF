/**
 * "เรียกรถโดยสาร" screen (spec 1.1 shortcut card / spec 2.7 — Epic 10,
 * docs/PHASE2_BACKLOG.md Epic 10). Residents only ever see active providers
 * — `GET /transport-providers` is server-scoped to `isActive: true` for any
 * non-ADMIN caller (see transport-provider.service.ts's list()), so this
 * screen doesn't need to filter that client-side. Tapping "โทร" opens the
 * device dialer via a `tel:` link — spec 2.7 is explicit this is NOT a
 * ride-hailing API integration, just a curated phone book.
 */
import { useCallback, useState } from "react";
import {
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../lib/api";
import type { TransportProvider, TransportProviderType } from "../../lib/types";
import { Button } from "../../components/Button";
import { colors, radius, spacing } from "../../theme";

const TYPE_LABEL: Record<TransportProviderType, string> = {
  MOTORCYCLE: "วินมอเตอร์ไซค์",
  TAXI: "แท็กซี่",
  VAN: "รถตู้",
  OTHER: "อื่นๆ",
};

const TYPE_ICON: Record<TransportProviderType, string> = {
  MOTORCYCLE: "🏍️",
  TAXI: "🚕",
  VAN: "🚐",
  OTHER: "🚗",
};

const FILTERS: Array<TransportProviderType | "ALL"> = ["ALL", "MOTORCYCLE", "TAXI", "VAN", "OTHER"];

export function TransportScreen() {
  const [providers, setProviders] = useState<TransportProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TransportProviderType | "ALL">("ALL");

  const load = useCallback(async (filter: TransportProviderType | "ALL") => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === "ALL" ? "" : `?type=${filter}`;
      const data = await api.get<TransportProvider[]>(`/transport-providers${qs}`);
      setProviders(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดทำเนียบรถรับจ้างไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(typeFilter);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typeFilter]),
  );

  function call(phone: string) {
    Linking.openURL(`tel:${phone}`).catch(() => undefined);
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, typeFilter === f && styles.filterChipActive]}
            onPress={() => setTypeFilter(f)}
          >
            <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>
              {f === "ALL" ? "ทั้งหมด" : TYPE_LABEL[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={providers}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(typeFilter)} />}
        ListEmptyComponent={
          !loading && !error ? <Text style={styles.empty}>ยังไม่มีผู้ให้บริการในหมวดนี้</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.icon}>{TYPE_ICON[item.type]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{TYPE_LABEL[item.type]}</Text>
              {item.serviceArea ? <Text style={styles.meta}>{item.serviceArea}</Text> : null}
              <Text style={styles.phone}>{item.phone}</Text>
            </View>
            <Button title="📞 โทร" variant="secondary" onPress={() => call(item.phone)} style={styles.callButton} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.md,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, color: colors.textSecondary },
  filterChipTextActive: { color: colors.white, fontWeight: "700" },
  errorText: { color: colors.danger, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md + 2,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: { fontSize: 28 },
  name: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  phone: { fontSize: 13, color: colors.primaryDark, marginTop: spacing.xs, fontWeight: "600" },
  callButton: { paddingVertical: spacing.sm + 1, paddingHorizontal: spacing.md },
});
