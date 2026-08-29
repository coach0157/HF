import type { CSSProperties, ReactNode } from 'react';
import { colors, radius, semanticColors } from '../theme';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const VARIANT_STYLE: Record<BadgeVariant, CSSProperties> = {
  success: { background: semanticColors.successLight, color: colors.primaryDark, border: `1px solid ${colors.primary}` },
  warning: { background: semanticColors.warningLight, color: '#92400E', border: `1px solid ${colors.warning}` },
  danger: { background: semanticColors.dangerLight, color: '#991B1B', border: `1px solid ${colors.danger}` },
  info: { background: semanticColors.infoLight, color: colors.secondaryDark, border: `1px solid ${colors.secondary}` },
  neutral: { background: colors.border, color: colors.textSecondary, border: `1px solid ${colors.textMuted}` },
};

interface BadgeProps {
  variant?: BadgeVariant;
  children?: ReactNode;
  style?: CSSProperties;
}

/**
 * Pill-shaped status badge per docs/DESIGN_SYSTEM.md — used for announcement
 * level, SOS status, maintenance ticket status, transport provider type, etc.
 * Map meaning -> variant at the call site (e.g. ฉุกเฉิน -> danger).
 */
export function Badge({ variant = 'neutral', children, style }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: radius.pill,
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        ...VARIANT_STYLE[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
