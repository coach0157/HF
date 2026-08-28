/**
 * "หน้ารับแจ้งเหตุ SOS" (spec 1.2) — MVP_BACKLOG.md Epic 7.
 *
 * Polling every 5s (admin-web's SosPage pattern — no push/WebSocket channel
 * exists yet). Each row resolves the triggering resident's phone via
 * `GET /users/:id` (opened to GUARD by the previous dev-agent round) for
 * the "โทรกลับ" `tel:` button, and house_no via `GET /houses/:id`. Both are
 * cached in-memory per screen-session (`userCache`/`houseCache` refs) so a
 * 5s poll doesn't refire N+1 requests for alerts already resolved.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import type { AppUser, House, SosAlert } from "../../lib/types";

const POLL_MS = 5000;

interface EnrichedAlert extends SosAlert {
  houseNo?: string;
  callerName?: string;
  callerPhone?: string;
}

export function SosListScreen() {
  const [alerts, setAlerts] = useState<EnrichedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const userCache = useRef(new Map<string, AppUser>());
  const houseCache = useRef(new Map<string, House>());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enrich = useCallback(async (raw: SosAlert[]): Promise<EnrichedAlert[]> => {
    return Promise.all(
      raw.map(async (a) => {
        let user = userCache.current.get(a.triggeredByUserId);
        if (!user) {
          try {
            user = await api.get<AppUser>(`/users/${a.triggeredByUserId}`);
            userCache.current.set(a.triggeredByUserId, user);
          } catch {
            // Best-effort — the row still shows without a callback number.
          }
        }
        let house = houseCache.current.get(a.houseId);
        if (!house) {
          try {
            house = await api.get<House>(`/houses/${a.houseId}`);
            houseCache.current.set(a.houseId, house);
          } catch {
            // Best-effort — the row still shows without a house number.
          }
        }
        return {
          ...a,
          houseNo: house?.houseNo,
          callerName: user?.name,
          callerPhone: user?.phone,
        };
      }),
    );
  }, []);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      try {
        const pending = await api.get<SosAlert[]>("/sos-alerts?status=PENDING");
        const enriched = await enrich(pending);
        // Oldest-pending first (most urgent, waiting longest).
        enriched.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setAlerts(enriched);
      } catch {
        // Swallow poll errors silently — a transient network blip shouldn't
        // spam an alert dialog every 5s; the list just doesn't update.
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [enrich],
  );

  useFocusEffect(
    useCallback(() => {
      load(true);
      intervalRef.current = setInterval(() => load(false), POLL_MS);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [load]),
  );

  async function handleAcknowledge(alert: EnrichedAlert) {
    setAckingId(alert.id);
    try {
      await api.patch(`/sos-alerts/${alert.id}/acknowledge`);
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    } catch (e) {
      Alert.alert("รับเรื่องไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองใหม่อีกครั้ง");
    } finally {
      setAckingId(null);
    }
  }

  function handleCall(phone?: string) {
    if (!phone) {
      Alert.alert("ไม่พบเบอร์โทร", "ไม่สามารถโทรกลับได้");
      return;
    }
    Linking.openURL(`tel:${phone}`);
  }

  function handleMap(alert: SosAlert) {
    if (!alert.latitude || !alert.longitude) {
      Alert.alert("ไม่มีพิกัด", "แจ้งเหตุนี้ไม่มีข้อมูลตำแหน่ง GPS");
      return;
    }
    Linking.openURL(`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`);
  }

  return (
    <FlatList
      style={styles.container}
      data={alerts}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(true)} />}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>ไม่มีเหตุ SOS ที่รอดำเนินการ</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.houseNo}>บ้านเลขที่ {item.houseNo ?? "-"}</Text>
            <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString("th-TH")}</Text>
          </View>
          {item.callerName ? <Text style={styles.caller}>ผู้แจ้ง: {item.callerName}</Text> : null}

          <TouchableOpacity onPress={() => handleMap(item)}>
            <Text style={styles.coords}>
              {item.latitude && item.longitude ? `📍 ${item.latitude}, ${item.longitude} (แตะเพื่อดูแผนที่)` : "ไม่มีพิกัด GPS"}
            </Text>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.callButton} onPress={() => handleCall(item.callerPhone)}>
              <Text style={styles.callText}>📞 โทรกลับ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ackButton}
              onPress={() => handleAcknowledge(item)}
              disabled={ackingId === item.id}
            >
              {ackingId === item.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.ackText}>รับเรื่อง</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  empty: { color: "#999", textAlign: "center", padding: 24 },
  card: {
    margin: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fdecea",
    borderWidth: 1,
    borderColor: "#e74c3c",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  houseNo: { fontSize: 17, fontWeight: "800", color: "#c0392b" },
  time: { fontSize: 12, color: "#888" },
  caller: { fontSize: 13, color: "#444", marginTop: 4 },
  coords: { fontSize: 12, color: "#2980b9", marginTop: 6 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  callButton: {
    flex: 1,
    backgroundColor: "#2980b9",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  callText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ackButton: { flex: 1, backgroundColor: "#c0392b", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  ackText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
