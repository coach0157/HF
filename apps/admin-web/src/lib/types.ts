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
  // Populated by GET /announcements (QA fix — see announcement.service.ts's
  // list()/flattenTargetHouseIds()): the house ids currently targeted when
  // targetScope = HOUSE, so the edit form can preload existing selections
  // instead of forcing the admin to re-pick from scratch (previously caused
  // silent data loss on edit — see docs/QA_REPORT.md).
  targetHouseIds: string[];
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

// Epic 10 — Transport Directory (spec 2.7 / docs/PHASE2_BACKLOG.md Epic 10).
export type TransportProviderType = 'MOTORCYCLE' | 'TAXI' | 'VAN' | 'OTHER';

export interface TransportProvider {
  id: string;
  villageId: string;
  name: string;
  type: TransportProviderType;
  phone: string;
  serviceArea: string | null;
  isActive: boolean;
  createdAt: string;
}

// Epic 9 — Maintenance (spec 2.4 / docs/PHASE2_BACKLOG.md Epic 9).
export type MaintenanceCategory = 'ELECTRICAL' | 'PLUMBING' | 'ROAD' | 'OTHER';
export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';

export interface MaintenanceTicket {
  id: string;
  villageId: string;
  houseId: string;
  createdByUserId: string;
  category: MaintenanceCategory;
  description: string;
  imageUrl: string | null;
  status: MaintenanceStatus;
  assignedTo: string | null;
  scheduledDate: string | null;
  ticketNumber: string;
  createdAt: string;
}

// Epic 8 — Chat (spec 2.3 / docs/PHASE2_BACKLOG.md Epic 8, ADR-004/005 in
// docs/ARCHITECTURE.md §8.1-8.2). Shapes mirror apps/backend's
// chat.service.ts return values (hand-kept-in-sync, same as every other
// type in this file).
export type ChatRoomType = 'DIRECT' | 'GROUP';

export interface ChatMessage {
  id: string;
  villageId: string;
  chatRoomId: string;
  senderId: string;
  message: string | null;
  imageUrl: string | null;
  createdAt: string;
}

// Return shape of GET /chat-rooms (ChatService.listRooms) — a ChatRoom row
// enriched with the caller's own read state, a preview of the last message,
// and (for DIRECT rooms only) the other participant's basic identity.
export interface ChatRoomSummary {
  id: string;
  villageId: string;
  type: ChatRoomType;
  name: string | null;
  residentsCanPost: boolean;
  lastMessage: ChatMessage | null;
  lastReadAt: string | null;
  unreadCount: number;
  otherUser: { id: string; name: string; phone: string; role: UserRole } | null;
}
