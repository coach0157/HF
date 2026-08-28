/**
 * Param lists for each navigator. Kept in one file (React Navigation's
 * recommended pattern) so a screen can import its own params without
 * reaching into a sibling navigator's file.
 *
 * Dev agent TODO: add real params as screens are implemented (e.g.
 * `QrDisplay: { passId: string }`, `ExitConfirm: { entryLogId: string }`) —
 * left as `undefined` placeholders for now since this round is scaffold-only.
 */

export type AuthStackParamList = {
  PhoneLogin: undefined;
  OtpVerify: { phone: string };
};

export type ResidentTabParamList = {
  Home: undefined;
  InviteGuest: undefined;
  QrDisplay: undefined;
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
};

export type RootStackParamList = {
  Auth: undefined;
  ResidentApp: undefined;
  GuardApp: undefined;
};
