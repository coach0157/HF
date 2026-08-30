import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { disconnectChatSocket, getChatSocket } from '../lib/chat';
import { getSession } from '../lib/auth';
import { resolveImageUrl } from '../lib/image';
import type { AppUser, ChatMessage, ChatRoomSummary } from '../lib/types';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { colors, radius, spacing } from '../theme';

/**
 * Epic 8 — Chat, admin-web "นิติบุคคล" persona (spec 2.3 /
 * docs/PHASE2_BACKLOG.md Epic 8). Two-pane layout: room list on the left
 * (every DIRECT room a resident/guard started with this admin + the
 * village's GROUP room(s)), the open conversation on the right. Sending,
 * receiving, and typing all go over the Socket.io connection from
 * `lib/chat.ts` (ADR-004/005, docs/ARCHITECTURE.md §8.1-8.2) — only room
 * list / history / read-receipt / image-upload / residentsCanPost toggle go
 * through the REST `/chat-rooms*` endpoints.
 */

const ROLE_LABEL: Record<string, string> = { RESIDENT: 'ลูกบ้าน', GUARD: 'รปภ.', ADMIN: 'แอดมิน' };

function roomLabel(room: ChatRoomSummary): string {
  if (room.type === 'GROUP') return room.name ?? 'กลุ่ม';
  if (room.otherUser) return `${room.otherUser.name} (${ROLE_LABEL[room.otherUser.role] ?? room.otherUser.role})`;
  return 'แชท';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const inputStyle = {
  width: '100%',
  padding: spacing.sm,
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  boxSizing: 'border-box' as const,
  marginBottom: spacing.sm,
  fontFamily: 'inherit',
};

export function ChatPage() {
  const session = getSession();
  const [rooms, setRooms] = useState<ChatRoomSummary[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const [residents, setResidents] = useState<AppUser[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTargetId, setNewChatTargetId] = useState('');
  const [newChatError, setNewChatError] = useState<string | null>(null);

  const [settingsError, setSettingsError] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    setRoomsError(null);
    try {
      const data = await api.get<ChatRoomSummary[]>('/chat-rooms');
      setRooms(data);
    } catch (err) {
      setRoomsError(err instanceof ApiError ? err.message : 'โหลดรายการแชทไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    loadRooms();
    api.get<AppUser[]>('/users?role=RESIDENT').then(setResidents).catch(() => setResidents([]));
  }, [loadRooms]);

  const joinAndLoad = useCallback(async (roomId: string) => {
    const socket = getChatSocket();
    socket.emit('join_room', { chatRoomId: roomId });
    setMessagesLoading(true);
    try {
      const history = await api.get<{ items: ChatMessage[] }>(`/chat-rooms/${roomId}/messages?pageSize=50`);
      setMessages([...history.items].reverse());
      socket.emit('mark_read', { chatRoomId: roomId });
      setRooms((prev) => prev?.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)) ?? prev);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'โหลดประวัติแชทไม่สำเร็จ');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  function selectRoom(roomId: string) {
    setSelectedRoomId(roomId);
    setSendError(null);
    setMessages([]);
    joinAndLoad(roomId);
  }

  // Socket.io wiring: connect once on mount, tear down on unmount. Handlers
  // read `selectedRoomIdRef.current` (not the `selectedRoomId` state
  // directly) so they always see the latest selection without needing to
  // re-subscribe on every room switch.
  useEffect(() => {
    const socket = getChatSocket();

    function onConnect() {
      setConnected(true);
      // Socket.io rooms don't survive a reconnect — rejoin whatever room is
      // currently open so real-time delivery keeps working after a network
      // blip (ADR-005 point 5's reconnect handling is about the token; this
      // is the companion room-rejoin step on the client).
      if (selectedRoomIdRef.current) {
        socket.emit('join_room', { chatRoomId: selectedRoomIdRef.current });
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onNewMessage(message: ChatMessage) {
      if (message.chatRoomId === selectedRoomIdRef.current) {
        setMessages((prev) => [...prev, message]);
        if (message.senderId !== session?.userId) {
          socket.emit('mark_read', { chatRoomId: message.chatRoomId });
        }
      }
      setRooms((prev) => {
        if (!prev) return prev;
        return prev.map((r) =>
          r.id === message.chatRoomId
            ? {
                ...r,
                lastMessage: message,
                unreadCount:
                  message.chatRoomId === selectedRoomIdRef.current || message.senderId === session?.userId
                    ? r.unreadCount
                    : r.unreadCount + 1,
              }
            : r,
        );
      });
    }
    function onException(payload: { message?: string | string[] }) {
      const msg = Array.isArray(payload?.message) ? payload.message.join('; ') : payload?.message;
      setSendError(msg || 'เกิดข้อผิดพลาดในการแชท');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('new_message', onNewMessage);
    socket.on('exception', onException);
    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('new_message', onNewMessage);
      socket.off('exception', onException);
      disconnectChatSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedRoomId || !messageInput.trim()) return;
    setSendError(null);
    getChatSocket().emit('send_message', { chatRoomId: selectedRoomId, message: messageInput.trim() });
    setMessageInput('');
  }

  async function handleAttachImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedRoomId) return;
    setSendError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const { imageUrl } = await api.post<{ imageUrl: string }>(`/chat-rooms/${selectedRoomId}/image`, {
        photoDataUrl: dataUrl,
      });
      getChatSocket().emit('send_message', { chatRoomId: selectedRoomId, imageUrl });
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'แนบรูปไม่สำเร็จ');
    }
  }

  async function handleStartChat(e: FormEvent) {
    e.preventDefault();
    setNewChatError(null);
    if (!newChatTargetId) {
      setNewChatError('กรุณาเลือกลูกบ้าน');
      return;
    }
    try {
      const room = await api.post<{ id: string }>('/chat-rooms', {
        type: 'DIRECT',
        targetUserId: newChatTargetId,
      });
      setShowNewChat(false);
      setNewChatTargetId('');
      await loadRooms();
      selectRoom(room.id);
    } catch (err) {
      setNewChatError(err instanceof ApiError ? err.message : 'เริ่มแชทไม่สำเร็จ');
    }
  }

  async function toggleResidentsCanPost(room: ChatRoomSummary) {
    setSettingsError(null);
    try {
      await api.patch(`/chat-rooms/${room.id}`, { residentsCanPost: !room.residentsCanPost });
      await loadRooms();
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    }
  }

  const selectedRoom = rooms?.find((r) => r.id === selectedRoomId) ?? null;

  return (
    <div>
      <h1 style={{ color: colors.textPrimary }}>แชท</h1>
      <p style={{ color: connected ? colors.primaryDark : colors.danger, fontSize: 13 }}>
        {connected ? '● เชื่อมต่อแล้ว' : '○ กำลังเชื่อมต่อ...'}
      </p>

      <Card style={{ display: 'flex', gap: spacing.lg, height: 560, padding: 0, overflow: 'hidden' }}>
        <div style={{ width: 300, borderRight: `1px solid ${colors.border}`, overflowY: 'auto', padding: spacing.md }}>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setShowNewChat((v) => !v)}
            style={{ margin: `0 0 ${spacing.sm}px` }}
          >
            + เริ่มแชทกับลูกบ้าน
          </Button>
          {showNewChat && (
            <Card style={{ marginBottom: spacing.md }} padding={spacing.sm}>
              <form onSubmit={handleStartChat}>
                <select
                  value={newChatTargetId}
                  onChange={(e) => setNewChatTargetId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">เลือกลูกบ้าน</option>
                  {residents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.phone})
                    </option>
                  ))}
                </select>
                {newChatError && <p style={{ color: colors.danger, fontSize: 12 }}>{newChatError}</p>}
                <Button type="submit">เริ่มแชท</Button>
              </form>
            </Card>
          )}

          {roomsError && <p style={{ color: colors.danger }}>{roomsError}</p>}
          {rooms === null && !roomsError && <p style={{ color: colors.textSecondary }}>กำลังโหลด...</p>}
          {rooms?.map((room) => (
            <div
              key={room.id}
              onClick={() => selectRoom(room.id)}
              style={{
                padding: spacing.sm + 2,
                cursor: 'pointer',
                borderRadius: 8,
                background: room.id === selectedRoomId ? colors.secondaryLight : undefined,
                marginBottom: spacing.xs,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 14, color: colors.textPrimary }}>{roomLabel(room)}</strong>
                {room.unreadCount > 0 && (
                  <span
                    style={{
                      background: colors.danger,
                      color: '#fff',
                      borderRadius: radius.pill,
                      padding: '0 6px',
                      fontSize: 11,
                    }}
                  >
                    {room.unreadCount}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {room.lastMessage?.message ?? (room.lastMessage?.imageUrl ? '[รูปภาพ]' : 'ยังไม่มีข้อความ')}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: spacing.md }}>
          {!selectedRoom && <p style={{ color: colors.textMuted }}>เลือกห้องแชทจากรายการด้านซ้าย</p>}

          {selectedRoom && (
            <>
              <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: spacing.sm, marginBottom: spacing.sm }}>
                <strong style={{ color: colors.textPrimary }}>{roomLabel(selectedRoom)}</strong>
                {selectedRoom.type === 'GROUP' && (
                  <div style={{ fontSize: 12, marginTop: spacing.xs, color: colors.textSecondary }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedRoom.residentsCanPost}
                        onChange={() => toggleResidentsCanPost(selectedRoom)}
                      />{' '}
                      เปิดให้ลูกบ้านโพสต์ในกลุ่มนี้ได้ (ปิด = แอดมินประกาศได้ฝ่ายเดียว)
                    </label>
                    {settingsError && <p style={{ color: colors.danger }}>{settingsError}</p>}
                  </div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {messagesLoading && <p style={{ color: colors.textSecondary }}>กำลังโหลดข้อความ...</p>}
                {messages.map((m) => {
                  const mine = m.senderId === session?.userId;
                  return (
                    <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                      <div
                        style={{
                          background: mine ? colors.primary : colors.background,
                          color: mine ? '#fff' : colors.textPrimary,
                          borderRadius: radius.input,
                          padding: '8px 12px',
                        }}
                      >
                        {m.imageUrl && session && (
                          // ADR-007 (docs/ARCHITECTURE.md) — resolveImageUrl()
                          // turns the stored "local://bucket/village/file" ref
                          // into a real fetchable URL against `GET /files/...`.
                          <img
                            src={resolveImageUrl(m.imageUrl, session.accessToken)}
                            alt="รูปภาพแนบ"
                            style={{
                              maxWidth: 220,
                              maxHeight: 220,
                              borderRadius: radius.input,
                              display: 'block',
                              marginBottom: m.message ? 6 : 0,
                            }}
                          />
                        )}
                        {m.message && <div>{m.message}</div>}
                      </div>
                      <div style={{ fontSize: 10, color: colors.textMuted, textAlign: mine ? 'right' : 'left' }}>
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {sendError && <p style={{ color: colors.danger }}>{sendError}</p>}

              <form onSubmit={handleSend} style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  📎
                  <input type="file" accept="image/*" onChange={handleAttachImage} style={{ display: 'none' }} />
                </label>
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="พิมพ์ข้อความ..."
                  style={{
                    flex: 1,
                    padding: spacing.sm,
                    borderRadius: radius.input,
                    border: `1px solid ${colors.border}`,
                    fontSize: 14,
                  }}
                />
                <Button type="submit" disabled={!messageInput.trim()}>
                  ส่ง
                </Button>
              </form>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
