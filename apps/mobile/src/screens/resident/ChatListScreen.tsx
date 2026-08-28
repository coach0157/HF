/**
 * Resident "แชท" tab (spec 1.1: 3 fixed destinations — "นิติบุคคล" /
 * "รปภ." / "กลุ่มหมู่บ้าน", not a general room list). Each card
 * find-or-creates the right room and drills into the shared
 * ChatRoomScreen:
 *  - "นิติบุคคล" / "รปภ." — a 1:1 DIRECT room with an admin/guard. Which
 *    specific admin/guard to target is resolved via the Epic 8
 *    staff-directory view of `GET /users?role=` (see
 *    apps/backend/src/modules/auth/users.service.ts's doc comment — opened
 *    to RESIDENT specifically for this, still never exposes other
 *    residents). Dev-agent decision: picks the first ADMIN/GUARD returned
 *    (a village realistically has one admin login and a small guard roster
 *    in this MVP; no UI exists yet to choose a specific staff member — spec
 *    1.1's wireframe shows one card per role, not a picker).
 *  - "กลุ่มหมู่บ้าน" — the auto-provisioned village GROUP room, already
 *    guaranteed to exist after the initial `GET /chat-rooms` call (see
 *    ChatService.ensureVillageGroupRoom).
 */
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiError } from "../../lib/api";
import type { AppUser, ChatRoomSummary } from "../../lib/types";
import type { ChatStackParamList } from "../../navigation/types";
import { colors, radius, spacing } from "../../theme";

interface ChatTarget {
  key: string;
  icon: string;
  label: string;
  subLabel: string;
  find: (rooms: ChatRoomSummary[]) => ChatRoomSummary | undefined;
  resolve: () => Promise<{ chatRoomId: string } | null>;
}

export function ChatListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatStackParamList, "ChatList">>();
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ChatRoomSummary[]>("/chat-rooms");
      setRooms(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดรายการแชทไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  // NOTE: deliberately just a REST refetch, no socket teardown here.
  // `useFocusEffect`'s cleanup fires on every BLUR, including pushing
  // ChatRoomScreen on top of this same stack — disconnecting the shared
  // chat socket there would kill the very connection ChatRoomScreen just
  // opened. The socket is a long-lived singleton (see lib/chat.ts) that
  // stays connected for the whole session; it's only torn down explicitly
  // on logout (ProfileScreen.handleLogout).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const targets: ChatTarget[] = [
    {
      key: "admin",
      icon: "🏢",
      label: "นิติบุคคล",
      subLabel: "ติดต่อสอบถาม/แจ้งเรื่องกับนิติบุคคล",
      find: (rs) => rs.find((r) => r.type === "DIRECT" && r.otherUser?.role === "ADMIN"),
      resolve: async () => {
        const admins = await api.get<AppUser[]>("/users?role=ADMIN");
        if (!admins[0]) return null;
        return api.post<{ id: string }>("/chat-rooms", { type: "DIRECT", targetUserId: admins[0].id }).then(
          (r) => ({ chatRoomId: r.id }),
        );
      },
    },
    {
      key: "guard",
      icon: "🛡️",
      label: "รปภ.",
      subLabel: "ติดต่อเจ้าหน้าที่รักษาความปลอดภัย",
      find: (rs) => rs.find((r) => r.type === "DIRECT" && r.otherUser?.role === "GUARD"),
      resolve: async () => {
        const guards = await api.get<AppUser[]>("/users?role=GUARD");
        if (!guards[0]) return null;
        return api.post<{ id: string }>("/chat-rooms", { type: "DIRECT", targetUserId: guards[0].id }).then(
          (r) => ({ chatRoomId: r.id }),
        );
      },
    },
    {
      key: "group",
      icon: "👥",
      label: "กลุ่มหมู่บ้าน",
      subLabel: "ข่าวสาร/พูดคุยร่วมกับเพื่อนบ้าน",
      find: (rs) => rs.find((r) => r.type === "GROUP" && r.name === "กลุ่มหมู่บ้าน"),
      resolve: async () => null,
    },
  ];

  async function openTarget(target: ChatTarget) {
    setError(null);
    const existing = target.find(rooms);
    if (existing) {
      navigation.navigate("ChatRoom", { chatRoomId: existing.id, title: target.label });
      return;
    }
    setOpening(target.key);
    try {
      const resolved = await target.resolve();
      if (!resolved) {
        setError(
          target.key === "group"
            ? "ยังไม่มีกลุ่มหมู่บ้าน กรุณาลองใหม่อีกครั้ง"
            : "ยังไม่มีผู้ดูแลระบบ/รปภ. ในหมู่บ้านนี้",
        );
        return;
      }
      navigation.navigate("ChatRoom", { chatRoomId: resolved.chatRoomId, title: target.label });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "เปิดแชทไม่สำเร็จ");
    } finally {
      setOpening(null);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error && <Text style={styles.errorText}>{error}</Text>}
      {targets.map((target) => {
        const room = target.find(rooms);
        return (
          <TouchableOpacity
            key={target.key}
            style={styles.row}
            onPress={() => openTarget(target)}
            disabled={opening === target.key}
          >
            <Text style={styles.icon}>{target.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{target.label}</Text>
              <Text style={styles.preview} numberOfLines={1}>
                {room?.lastMessage?.message ?? (room?.lastMessage?.imageUrl ? "[รูปภาพ]" : target.subLabel)}
              </Text>
            </View>
            {opening === target.key ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : room && room.unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{room.unreadCount > 9 ? "9+" : room.unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  errorText: { color: colors.danger, padding: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: { fontSize: 28 },
  label: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  preview: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: "700" },
});
