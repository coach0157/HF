/**
 * Design tokens for the mobile app — mirrors docs/DESIGN_SYSTEM.md exactly.
 * This is the single source of truth for color/spacing/radius across
 * `apps/mobile`; screens should import from here instead of hardcoding hex
 * values. Keep in sync with apps/admin-web's equivalent token file (same
 * values, per DESIGN_SYSTEM.md's "ต้องใช้ค่าเดียวกันทั้งสองฝั่ง").
 */

export const colors = {
  // Primary (เขียว) — ปุ่มหลัก, active state, success
  primary: "#10B981",
  primaryDark: "#059669",
  primaryLight: "#D1FAE5",

  // Secondary (ฟ้า) — ปุ่มรอง, ลิงก์, info, header accent
  secondary: "#0EA5E9",
  secondaryDark: "#0284C7",
  secondaryLight: "#E0F2FE",

  // Neutral
  background: "#F9FAFB",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",

  // Semantic
  danger: "#EF4444",
  dangerLight: "#FEE2E2",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  // aliases per DESIGN_SYSTEM.md ("success = primary", "info = secondary")
  success: "#10B981",
  successLight: "#D1FAE5",
  info: "#0EA5E9",
  infoLight: "#E0F2FE",

  white: "#FFFFFF",
  black: "#000000",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  button: 10,
  card: 12,
  input: 12,
  pill: 999,
} as const;

export const theme = { colors, spacing, radius } as const;

export type ThemeColors = typeof colors;
export type ThemeSpacing = typeof spacing;
export type ThemeRadius = typeof radius;

export default theme;
