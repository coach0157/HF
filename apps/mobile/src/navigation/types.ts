/**
 * Param lists for each navigator. Kept in one file (React Navigation's
 * recommended pattern) so a screen can import its own params without
 * reaching into a sibling navigator's file.
 *
 * QrDisplay takes the full `VisitorPass` object (not just an id) because
 * there is no resident-callable "get one pass" endpoint — `GET
 * /visitor-passes/:token` is GUARD-only (it's the scan endpoint). The
 * resident-side pass object always comes from either `POST
 * /visitor-passes` (create) or `GET /visitor-passes` (list), both of which
 * already return the full record, so it's just carried through nav params.
 */

import type { VisitorPass } from "../lib/types";

export type AuthStackParamList = {
  PhoneLogin: undefined;
  OtpVerify: { phone: string };
};

// Epic 8 — Chat (spec 2.3 / docs/PHASE2_BACKLOG.md Epic 8). Shared by both
// the resident and guard "Chat" tab's nested stack (ChatStackNavigator in
// each of ResidentTabNavigator.tsx / GuardTabNavigator.tsx) — the list
// screen differs per role (resident: 3 fixed targets; guard: dynamic
// DIRECT-room list) but both drill into the same shared ChatRoomScreen.
export type ChatStackParamList = {
  ChatList: undefined;
  ChatRoom: { chatRoomId: string; title: string };
};

export type ResidentTabParamList = {
  Home: undefined;
  InviteGuest: undefined;
  QrDisplay: { pass: VisitorPass };
  EntryHistory: undefined;
  Transport: undefined;
  Maintenance: undefined;
  CreateMaintenance: undefined;
  Announcements: undefined;
  Chat: undefined;
  Profile: undefined;
};

export type GuardTabParamList = {
  Home: undefined;
  ScanQr: undefined;
  ManualEntry: undefined;
  ExitConfirm: undefined;
  SosList: undefined;
  // Epic 12 — Guard Patrol Log (docs/PHASE2_BACKLOG.md §5). Registered as a
  // Tab.Screen (so plain `navigation.navigate("PatrolLog")` works from
  // GuardHomeScreen's quick-links grid, same as every other quick link) but
  // hidden from the visible tab bar via `tabBarButton` in
  // GuardTabNavigator.tsx — the tab bar is already at 7 visible items.
  PatrolLog: undefined;
  Chat: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  ResidentApp: undefined;
  GuardApp: undefined;
};
