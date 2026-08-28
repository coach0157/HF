/**
 * "หน้าประกาศ" (spec 1.1/2.2) — MVP_BACKLOG.md Epic 6. Same feed powers the
 * Home screen's 3-item preview; this is the full list with detail
 * expand-on-tap (no separate detail route — avoids an extra nav param
 * type just to show title/content/imageUrl inline) and mark-as-read.
 *
 * Unread state: `item.reads` is empty for a not-yet-read announcement (see
 * lib/types.ts's doc comment on why — announcement.service.ts's list()
 * includes the caller's own read row, if any, unflattened).
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../lib/api";
import type { Announcement } from "../../lib/types";
import { Badge, type BadgeVariant } from "../../components/Badge";
import { colors, radius, spacing } from "../../theme";

const LEVEL_LABEL: Record<Announcement["level"], string> = {
  NORMAL: "ปกติ",
  IMPORTANT: "สำคัญ",
  EMERGENCY: "ฉุกเฉิน",
};
const LEVEL_BADGE_VARIANT: Record<Announcement["level"], BadgeVariant> = {
  NORMAL: "neutral",
  IMPORTANT: "warning",
  EMERGENCY: "danger",
};

export function AnnouncementsScreen() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Announcement[]>("/announcements");
      setItems(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดประกาศไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleOpen(a: Announcement) {
    setExpandedId(expandedId === a.id ? null : a.id);
    if ((a.reads?.length ?? 0) === 0) {
      try {
        await api.post(`/announcements/${a.id}/read`);
        setItems((prev) =>
          prev.map((it) => (it.id === a.id ? { ...it, reads: [{ readAt: new Date().toISOString() }] } : it)),
        );
      } catch {
        // Read-receipt failure isn't user-facing — the content is already
        // shown; retry silently happens next time the feed reloads.
      }
    }
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>ยังไม่มีประกาศ</Text> : null}
      renderItem={({ item }) => {
        const unread = (item.reads?.length ?? 0) === 0;
        const expanded = expandedId === item.id;
        return (
          <TouchableOpacity style={styles.row} onPress={() => handleOpen(item)}>
            <Badge label={LEVEL_LABEL[item.level]} variant={LEVEL_BADGE_VARIANT[item.level]} style={styles.levelBadge} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, unread && styles.titleUnread]}>{item.title}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString("th-TH")}</Text>
              {expanded && (
                <View style={styles.detail}>
                  <Text style={styles.content}>{item.content}</Text>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
                  ) : null}
                </View>
              )}
            </View>
            {unread && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: colors.danger, textAlign: "center", padding: spacing.lg },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.md + 2,
    gap: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  levelBadge: { marginTop: 2 },
  title: { fontSize: 15, fontWeight: "500", color: colors.textPrimary },
  titleUnread: { fontWeight: "800" },
  date: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.secondary, marginTop: spacing.sm - 2 },
  detail: { marginTop: spacing.sm },
  content: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  image: { width: "100%", height: 180, borderRadius: radius.card, marginTop: spacing.sm },
});
