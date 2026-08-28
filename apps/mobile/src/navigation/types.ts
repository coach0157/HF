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

export type ResidentTabParamList = {
  Home: undefined;
  InviteGuest: undefined;
  QrDisplay: { pass: VisitorPass };
  EntryHistory: undefined;
  Announcements: undefined;
  Profile: undefined;
};

export type GuardTabParamList = {
  Home: undefined;
  ScanQr: undefined;
  ManualEntry: undefined;
  ExitConfirm: undefined;
  SosList: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  ResidentApp: undefined;
  GuardApp: undefined;
};
