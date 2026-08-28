import type { CSSProperties, ReactNode } from 'react';
import { colors, radius, spacing } from '../theme';

interface CardProps {
  children?: ReactNode;
  style?: CSSProperties;
  padding?: number;
  onClick?: () => void;
  as?: 'div';
}

/**
 * Standard card/surface container per docs/DESIGN_SYSTEM.md (white surface,
 * subtle border, 12px radius). Used for forms, list items, and dashboard
 * summary tiles.
 */
export function Card({ children, style, padding = spacing.lg, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.card,
        padding,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
