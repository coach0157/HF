/**
 * Response shapes mirrored from apps/backend's Prisma models
 * (apps/backend/prisma/schema.prisma) / service return values.
 *
 * Copied from apps/admin-web/src/lib/types.ts (same backend, same hand-kept-
 * in-sync approach — see that file's doc comment re: an OpenAPI-generated
 * client once the API stabilizes) and extended with the shapes the mobile
 * app needs that admin-web never did (VisitorPass, the scan response).
 */

export type UserRole = "RESIDENT" | "GUARD" | "ADMIN";

export interface AppUser {
  id: string;
  villageId: string;
  name: string;
  phone: string;
  role: UserRole;
  houseId: string | null;
  createdAt?: string;
}

export interface House {
  id: string;
  villageId: string;
  houseNo: string;
  zone: string | null;
  latitude: string | null;
  longitude: string | null;
  ownerUserId: string | null;
}

export type AnnouncementLevel = "NORMAL" | "IMPORTANT" | "EMERGENCY";
export type AnnouncementTargetScope = "ALL" | "ZONE" | "HOUSE";

export interface Announcement {
  id: string;
  villageId: string;
  createdByAdminId: string;
  title: string;
  content: string;
  level: AnnouncementLevel;
  targetScope: AnnouncementTargetScope;
  targetZone: string | null;
  targetHouseIds: string[];
  imageUrl: string | null;
  createdAt: string;
  // Dev agent TODO: confirm whether GET /announcements already annotates
  // per-caller read state, or whether the feed screen must cross-reference
  // POST /announcements/:id/read separately (see announcement.service.ts).
  readAt?: string | null;
}

export type SosStatus = "PENDING" | "ACKNOWLEDGED" | "RESOLVED";

export interface SosAlert {
  id: string;
  villageId: string;
  triggeredByUserId: string;
  houseId: string;
  latitude: string | null;
  longitude: string | null;
  status: SosStatus;
  acknowledgedByGuardId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type GuardShiftStatus = "ON_DUTY" | "OFF_DUTY";

export interface GuardShift {
  id: string;
  villageId: string;
  guardUserId: string;
  shiftStart: string;
  shiftEnd: string | null;
  status: GuardShiftStatus;
}

export type EntryMethod = "QR" | "MANUAL";
export type ExitConfirmationMethod = "GUARD" | "RESIDENT";

export interface EntryLog {
  id: string;
  villageId: string;
  passId: string | null;
  houseId: string;
  recordedByGuardId: string;
  visitorName: string | null;
  vehiclePlate: string | null;
  photoUrl: string | null;
  entryTime: string;
  exitTime: string | null;
  exitConfirmedByUserId: string | null;
  exitConfirmationMethod: ExitConfirmationMethod | null;
  method: EntryMethod;
}

export type VisitorPassUsageType = "SINGLE" | "MULTI";
export type VisitorPassStatus =
  | "UNUSED"
  | "ENTERED"
  | "EXITED"
  | "EXPIRED"
  | "REVOKED";

export interface VisitorPass {
  id: string;
  villageId: string;
  createdByUserId: string;
  visitorName: string;
  visitorPhone: string | null;
  vehiclePlate: string | null;
  qrToken: string;
  validFrom: string;
  validTo: string;
  usageType: VisitorPassUsageType;
  status: VisitorPassStatus;
  createdAt: string;
}

// Return shape of GET /visitor-passes/:token (visitor-pass.service.ts's
// scanDetails()) — what the Guard app's scan screen renders before
// confirming entry.
export interface VisitorPassScanResult {
  pass: VisitorPass;
  host: {
    id: string;
    name: string;
    phone: string;
    houseNo: string | null;
  } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
