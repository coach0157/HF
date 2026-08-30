/**
 * Profile-picture avatar — shared by resident/guard ProfileScreen (Dev-agent
 * addition, avatar upload feature; backend side already complete, see
 * apps/backend/src/modules/auth/{users.controller,users.service}.ts and
 * dto/update-avatar.dto.ts). Pulled into one component instead of
 * duplicating pick+upload logic in both ProfileScreen.tsx files, since the
 * two screens are otherwise near-identical already.
 *
 * Circle with either the user's photo, or an initial-letter placeholder on
 * `colors.primaryLight` when there's no photo (or it can't be displayed —
 * see isFetchableUri below). When `editable`, tapping it opens
 * expo-image-picker's gallery picker (same API already used by
 * ChatRoomScreen.tsx's image-attach: `base64: true`, hardcoded
 * `image/jpeg` mime — per expo-image-picker's own docs, the base64 output
 * is always JPEG-encoded regardless of the source file's format), uploads
 * via `PATCH /users/me/avatar`, and reports the new avatarUrl back to the
 * caller so it can sync AuthContext/session.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, ApiError } from "../lib/api";
import type { AppUser } from "../lib/types";
import { colors } from "../theme";

// Mirrors apps/backend/src/modules/auth/users.service.ts's
// MAX_AVATAR_BYTES (3 MB) — a cheap client-side pre-check so an obviously
// oversized pick fails fast instead of round-tripping to the server. The
// server re-validates independently and remains the source of truth.
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

export interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  editable?: boolean;
  onUploaded?: (avatarUrl: string | null) => void;
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

// The backend stores avatarUrl as a `local://bucket/village/filename` ref
// (see FileStorageService.savePhoto's doc comment) — not a real fetchable
// HTTP URL in this MVP's local-disk storage implementation. RN's <Image>
// can't load that scheme, so only render it for a URI we know the device
// can actually fetch. This is the same caution ChatRoomScreen.tsx already
// takes with `imageUrl` (it shows a "📷 รูปภาพแนบ" placeholder instead of
// rendering the image) — not a new limitation introduced here.
function isFetchableUri(uri: string): boolean {
  return /^(https?:|data:|file:|content:|ph:|assets-library:)/.test(uri);
}

export function Avatar({
  name,
  avatarUrl,
  size = 72,
  editable = false,
  onUploaded,
}: AvatarProps) {
  const [uploading, setUploading] = useState(false);
  // Optimistic local preview shown right after a successful pick+upload,
  // before relying on the (non-fetchable) `local://` ref the backend
  // returns — see isFetchableUri above.
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);

  const displayUri =
    localPreviewUri ??
    (avatarUrl && isFetchableUri(avatarUrl) ? avatarUrl : null);

  async function handlePress() {
    if (!editable || uploading) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "ต้องการสิทธิ์เข้าถึงรูปภาพ",
        "กรุณาอนุญาตการเข้าถึงคลังรูปภาพเพื่อเปลี่ยนรูปโปรไฟล์",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.5,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) return;

    // ~4/3 of decoded byte size, same approximation UsersService.updateAvatar()
    // uses server-side.
    const approxBytes = Math.floor((asset.base64.length * 3) / 4);
    if (approxBytes > MAX_AVATAR_BYTES) {
      Alert.alert(
        "ไฟล์ใหญ่เกินไป",
        `กรุณาเลือกรูปที่มีขนาดไม่เกิน ${MAX_AVATAR_BYTES / (1024 * 1024)}MB`,
      );
      return;
    }

    setUploading(true);
    try {
      const dataUrl = `data:image/jpeg;base64,${asset.base64}`;
      const updated = await api.patch<AppUser>("/users/me/avatar", {
        photoDataUrl: dataUrl,
      });
      setLocalPreviewUri(asset.uri);
      onUploaded?.(updated.avatarUrl ?? null);
    } catch (e) {
      Alert.alert(
        "อัปโหลดรูปไม่สำเร็จ",
        e instanceof ApiError ? e.message : "กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={!editable || uploading}
      accessibilityRole={editable ? "button" : undefined}
      accessibilityLabel={editable ? "เปลี่ยนรูปโปรไฟล์" : undefined}
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.4 }]}>
          {getInitial(name)}
        </Text>
      )}

      {uploading && (
        <View
          style={[
            styles.overlay,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <ActivityIndicator color={colors.white} />
        </View>
      )}

      {editable && !uploading && (
        <View style={styles.editBadge}>
          <Text style={styles.editBadgeText}>✎</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    overflow: "hidden",
  },
  initial: { color: colors.primaryDark, fontWeight: "700" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  editBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  editBadgeText: { color: colors.white, fontSize: 12 },
});

export default Avatar;
