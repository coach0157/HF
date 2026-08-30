/**
 * ADR-007 (docs/ARCHITECTURE.md) — admin-web equivalent of
 * apps/mobile/src/lib/image.ts. Converts a `local://bucket/village/
 * filename` ref (the shape `FileStorageService.savePhoto()` returns for
 * `photoUrl`/`imageUrl`/`avatarUrl` fields — see
 * apps/backend/src/common/storage/file-storage.service.ts) into the path
 * `GET /files/:bucket/:villageId/:filename` (apps/backend/src/common/files/)
 * expects.
 *
 * Bugfix (found live in this session): the original version returned a
 * plain URL string with the access token baked in as `?token=`, for a bare
 * `<img src>` to load directly. That works right after login, but the
 * access token expires after 15 minutes (JWT_ACCESS_EXPIRES_IN) and a plain
 * `<img>` tag has no way to notice a 401 and refresh — unlike every other
 * API call in this app, which goes through `apiFetch()`'s built-in
 * refresh-and-retry. Any admin session left open longer than that silently
 * broke every image with no visible error (just a broken-image icon).
 *
 * Fixed by fetching the file as an authenticated blob through
 * `apiFetchBlob()` (same refresh-and-retry as every other call) and handing
 * the component a `blob:` object URL instead — `useImageBlobUrl()` below.
 * `resolveImageUrl()` is kept only for the non-`local://` passthrough case
 * (Announcement.imageUrl, an admin-supplied URL not backed by this
 * endpoint).
 */
import { useEffect, useState } from 'react';
import { apiFetchBlob } from './api';

const LOCAL_REF_PATTERN = /^local:\/\/([^/]+)\/([^/]+)\/([^/]+)$/;

/** Returns the `/files/...` API path for a `local://...` ref, or `null` if `ref` isn't one. */
function toFilesPath(ref: string): string | null {
  const match = LOCAL_REF_PATTERN.exec(ref);
  if (!match) return null;
  const [, bucket, villageId, filename] = match;
  return `/files/${bucket}/${villageId}/${filename}`;
}

/**
 * For a ref that ISN'T a `local://...` ref (e.g. Announcement.imageUrl,
 * taken verbatim from an admin-supplied URL — announcement.service.ts never
 * routes it through FileStorageService) — pass it through unchanged rather
 * than dropping it. `local://` refs must go through `useImageBlobUrl()`
 * instead, not this function, now that serving them requires an
 * authenticated, refresh-aware fetch.
 */
export function resolveImageUrl(ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  if (toFilesPath(ref)) return undefined; // local:// ref — use useImageBlobUrl() instead
  return ref;
}

/**
 * Fetches a `local://...`-ref'd image as an authenticated blob (refreshing
 * the access token and retrying once if it's expired, same as any other API
 * call) and returns an object URL for it, or `undefined` while
 * loading/absent/failed. Revokes the previous object URL on cleanup so
 * repeated navigation doesn't leak blob URLs.
 */
export function useImageBlobUrl(ref: string | null | undefined): string | undefined {
  const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const path = ref ? toFilesPath(ref) : null;
    if (!path) {
      setBlobUrl(undefined);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

    apiFetchBlob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(undefined);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ref]);

  return blobUrl;
}
