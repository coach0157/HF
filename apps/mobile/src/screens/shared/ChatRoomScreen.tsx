/**
 * Epic 8 — Chat conversation screen (spec 2.3 / docs/PHASE2_BACKLOG.md Epic
 * 8, ADR-004/005 in docs/ARCHITECTURE.md §8.1-8.2). Shared by BOTH the
 * resident and guard navigators (a resident<->admin, resident<->guard, or
 * group-room conversation all render the same bubble UI) — the only
 * difference between callers is which screen navigated here and with what
 * `chatRoomId`/`title`.
 *
 * Bubble UI: sender's own messages right-aligned/green, everyone else's
 * left-aligned/gray, per-message timestamp, optional image attachment via
 * `expo-image-picker`. Real-time send/receive over the Socket.io connection
 * from `lib/chat.ts`; history via `GET /chat-rooms/:id/messages`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { api, ApiError } from "../../lib/api";
import { getChatSocket } from "../../lib/chat";
import { useAuth } from "../../context/AuthContext";
import type { ChatMessage, Paginated } from "../../lib/types";
import type { ChatStackParamList } from "../../navigation/types";
import { colors, radius, spacing } from "../../theme";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export function ChatRoomScreen() {
  const route = useRoute<RouteProp<ChatStackParamList, "ChatRoom">>();
  const navigation = useNavigation<NativeStackNavigationProp<ChatStackParamList, "ChatRoom">>();
  const { chatRoomId, title } = route.params;
  const { session } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const chatRoomIdRef = useRef(chatRoomId);
  chatRoomIdRef.current = chatRoomId;

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const history = await api.get<Paginated<ChatMessage>>(
        `/chat-rooms/${chatRoomId}/messages?pageSize=50`,
      );
      setMessages([...history.items].reverse());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "โหลดประวัติแชทไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [chatRoomId]);

  useEffect(() => {
    const socket = getChatSocket();

    function join() {
      socket.emit("join_room", { chatRoomId: chatRoomIdRef.current });
      socket.emit("mark_read", { chatRoomId: chatRoomIdRef.current });
    }
    function onConnect() {
      join();
    }
    function onNewMessage(message: ChatMessage) {
      if (message.chatRoomId !== chatRoomIdRef.current) return;
      setMessages((prev) => [...prev, message]);
      if (message.senderId !== session?.userId) {
        socket.emit("mark_read", { chatRoomId: chatRoomIdRef.current });
      }
    }
    function onException(payload: { message?: string | string[] }) {
      const msg = Array.isArray(payload?.message) ? payload.message.join("; ") : payload?.message;
      Alert.alert("ส่งข้อความไม่สำเร็จ", msg || "เกิดข้อผิดพลาด");
    }

    socket.on("connect", onConnect);
    socket.on("new_message", onNewMessage);
    socket.on("exception", onException);

    if (socket.connected) {
      join();
    } else {
      socket.connect();
    }

    loadHistory();

    return () => {
      socket.off("connect", onConnect);
      socket.off("new_message", onNewMessage);
      socket.off("exception", onException);
      // Deliberately NOT disconnecting the shared socket here — another
      // chat screen (or the room list) may still be mounted and want the
      // connection alive. `disconnectChatSocket()` is only called when the
      // whole chat area is left (see ChatListScreen's unmount), matching
      // the pattern of one connection reused across a chat session.
    };
  }, [loadHistory, session?.userId]);

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    getChatSocket().emit("send_message", { chatRoomId, message: text });
    setInput("");
  }

  async function handleAttachImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("ต้องการสิทธิ์เข้าถึงรูปภาพ", "กรุณาอนุญาตการเข้าถึงคลังรูปภาพเพื่อแนบรูป");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.5,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploading(true);
    try {
      const dataUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const { imageUrl } = await api.post<{ imageUrl: string }>(`/chat-rooms/${chatRoomId}/image`, {
        photoDataUrl: dataUrl,
      });
      getChatSocket().emit("send_message", { chatRoomId, imageUrl });
    } catch (e) {
      Alert.alert("แนบรูปไม่สำเร็จ", e instanceof ApiError ? e.message : "ลองอีกครั้ง");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const mine = item.senderId === session?.userId;
          return (
            <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {item.imageUrl && (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imagePlaceholderText}>📷 รูปภาพแนบ</Text>
                  </View>
                )}
                {item.message && (
                  <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.message}</Text>
                )}
              </View>
              <Text style={[styles.timestamp, mine ? styles.timestampMine : styles.timestampTheirs]}>
                {formatTime(item.createdAt)}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>เริ่มการสนทนาได้เลย</Text>}
      />

      <View style={styles.composer}>
        <TouchableOpacity style={styles.attachButton} onPress={handleAttachImage} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.attachIcon}>📷</Text>}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="พิมพ์ข้อความ..."
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim()}
        >
          <Text style={styles.sendButtonText}>ส่ง</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: colors.danger, padding: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm + 2 },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
  bubbleRow: { maxWidth: "78%" },
  bubbleRowMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleRowTheirs: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: 14, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleTheirs: { backgroundColor: colors.border },
  bubbleTextMine: { color: colors.white, fontSize: 14 },
  bubbleTextTheirs: { color: colors.textPrimary, fontSize: 14 },
  imagePlaceholder: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: radius.card - 4,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  imagePlaceholderText: { fontSize: 12 },
  timestamp: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  timestampMine: { textAlign: "right" },
  timestampTheirs: { textAlign: "left" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  attachIcon: { fontSize: 18 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    color: colors.textPrimary,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: colors.white, fontWeight: "700" },
});
