/**
 * ADR-007 (docs/ARCHITECTURE.md) — converts a `local://bucket/village/
 * filename` ref (the shape `FileStorageService.savePhoto()` returns for
 * `photoUrl`/`imageUrl`/`avatarUrl` fields — see
 * apps/backend/src/common/storage/file-storage.service.ts) into a real,
 * fetchable URL against the backend's `GET
 * /files/:bucket/:villageId/:filename` endpoint
 * (apps/backend/src/common/files/). Every screen that renders a photo from
 * one of those fields must go through this helper instead of passing the
 * raw ref straight to `<Image source={{ uri }}>` — RN can't load the
 * `local://` scheme at all.
 *
 * The access token is appended as `?token=`, not an `Authorization` header,
 * because RN's `<Image>` fires its own request and can't attach a custom
 * header — see the backend endpoint's own doc comment / ADR-007 for why
 * that's safe to accept on this one route.
 */
import { API_BASE_URL } from "./config";

const LOCAL_REF_PATTERN = /^local:\/\/([^/]+)\/([^/]+)\/([^/]+)$/;

export function resolveImageUrl(
  ref: string | null | undefined,
  accessToken: string,
): string | undefined {
  if (!ref) return undefined;

  const match = LOCAL_REF_PATTERN.exec(ref);
  if (!match) {
    // Not a `local://` ref — e.g. Announcement.imageUrl, which is taken
    // verbatim from an admin-supplied URL (announcement.service.ts never
    // routes it through FileStorageService) and may already be a real
    // http(s) URL. Pass it through unchanged rather than dropping it.
    return ref;
  }

  const [, bucket, villageId, filename] = match;
  return `${API_BASE_URL}/files/${bucket}/${villageId}/${filename}?token=${encodeURIComponent(accessToken)}`;
}
