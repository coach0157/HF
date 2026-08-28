/**
 * Response shapes mirrored from apps/backend's Prisma models
 * (apps/backend/prisma/schema.prisma) / service return values. Hand-kept in
 * sync rather than generated — see lib/api.ts's doc comment re: swapping
 * for an OpenAPI-generated client once the API stabilizes.
 */

export type UserRole = 'RESIDENT' | 'GUARD' | 'ADMIN';

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

export type AnnouncementLevel = 'NORMAL' | 'IMPORTANT' | 'EMERGENCY';
export type AnnouncementTargetScope = 'ALL' | 'ZONE' | 'HOUSE';

export interface Announcement {
  id: string;
  villageId: string;
  createdByAdminId: string;
  title: string;
  content: string;
  level: AnnouncementLevel;
  targetScope: AnnouncementTargetScope;
  targetZone: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export type SosStatus = 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED';

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

export type GuardShiftStatus = 'ON_DUTY' | 'OFF_DUTY';

export interface GuardShift {
  id: string;
  villageId: string;
  guardUserId: string;
  shiftStart: string;
  shiftEnd: string | null;
  status: GuardShiftStatus;
}

export type EntryMethod = 'QR' | 'MANUAL';
export type ExitConfirmationMethod = 'GUARD' | 'RESIDENT';

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

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
