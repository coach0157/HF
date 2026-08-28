/**
 * Design tokens mirrored from docs/DESIGN_SYSTEM.md — the single source of
 * truth shared with apps/mobile. Do not hand-roll hex colors/spacing
 * anywhere else in admin-web; import from here instead.
 */

export const colors = {
  // Primary (green — main buttons, active state, success)
  primary: '#10B981',
  primaryDark: '#059669',
  primaryLight: '#D1FAE5',

  // Secondary (blue — secondary buttons, links, info, header accent)
  secondary: '#0EA5E9',
  secondaryDark: '#0284C7',
  secondaryLight: '#E0F2FE',

  // Neutral
  background: '#F9FAFB',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Semantic
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
} as const;

// success/info are aliases per design system ("success = primary", "info = secondary")
export const semanticColors = {
  success: colors.primary,
  successLight: colors.primaryLight,
  info: colors.secondary,
  infoLight: colors.secondaryLight,
  warning: colors.warning,
  warningLight: colors.warningLight,
  danger: colors.danger,
  dangerLight: colors.dangerLight,
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

export const font = {
  family:
    "'Segoe UI', 'Noto Sans Thai', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

export const theme = { colors, semanticColors, spacing, radius, font };

export default theme;
