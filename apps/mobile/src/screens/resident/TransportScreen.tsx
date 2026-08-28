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
            <TouchableOpacity style={styles.callButton} onPress={() => call(item.phone)}>
              <Text style={styles.callButtonText}>📞 โทร</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipActive: { backgroundColor: "#1d6f42", borderColor: "#1d6f42" },
  filterChipText: { fontSize: 12, color: "#444" },
  filterChipTextActive: { color: "#fff", fontWeight: "700" },
  errorText: { color: "#c0392b", paddingHorizontal: 16, paddingBottom: 8 },
  empty: { color: "#999", textAlign: "center", padding: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  icon: { fontSize: 28 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12, color: "#666", marginTop: 2 },
  phone: { fontSize: 13, color: "#1d6f42", marginTop: 4, fontWeight: "600" },
  callButton: {
    backgroundColor: "#2980b9",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  callButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
