/**
 * Guard "แชท" tab — spec 2.3's "ลูกบ้าน-รปภ." side, and
 * docs/PHASE2_BACKLOG.md Epic 8's "Guard ChatScreen: รายการแชท DIRECT จาก
 * ลูกบ้านที่ทักเข้ามา" (list of DIRECT chats residents have started with
 * this guard). Unlike the resident's fixed 3-card screen, a guard's chat
 * list is a real, dynamic list — any resident can initiate a DIRECT chat
 * with a guard, so this guard has no way to know in advance who will reach
 * out. `GET /chat-rooms` already returns exactly "every room I'm a
 * participant of", so this is a straightforward render of that list.
 */
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, ApiError } from "../../lib/api";
import type { ChatRoomSummary } from "../../lib/types";
import type { ChatStackParamList } from "../../navigation/types";

function roomLabel(room: ChatRoomSummary): string {
  if (room.type === "GROUP") return room.name ?? "กลุ่มหมู่บ้าน";
  return room.otherUser?.name ?? "ลูกบ้าน";
}

export function ChatListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatStackParamList, "ChatList">>();
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Same as resident's ChatListScreen — plain REST refetch on focus, no
  // socket connect/disconnect here (see that screen's doc comment for why:
  // useFocusEffect's cleanup fires on blur too, including when this screen
  // is merely pushed under ChatRoomScreen within the same stack).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          !loading && !error ? <Text style={styles.empty}>ยังไม่มีลูกบ้านทักเข้ามา</Text> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate("ChatRoom", { chatRoomId: item.id, title: roomLabel(item) })}
          >
            <Text style={styles.icon}>{item.type === "GROUP" ? "👥" : "🏠"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{roomLabel(item)}</Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.lastMessage?.message ?? (item.lastMessage?.imageUrl ? "[รูปภาพ]" : "ยังไม่มีข้อความ")}
              </Text>
            </View>
            {item.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount > 9 ? "9+" : item.unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  errorText: { color: "#c0392b", padding: 16 },
  empty: { color: "#999", textAlign: "center", padding: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  icon: { fontSize: 26 },
  label: { fontSize: 15, fontWeight: "700" },
  preview: { fontSize: 12, color: "#888", marginTop: 3 },
  badge: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
