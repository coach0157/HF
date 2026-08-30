import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { colors, radius, spacing } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: colors.primary,
    color: colors.white,
    border: `1px solid ${colors.primary}`,
  },
  secondary: {
    background: colors.secondaryLight,
    color: colors.secondary,
    border: `1px solid ${colors.secondary}`,
  },
  danger: {
    background: colors.danger,
    color: colors.white,
    border: `1px solid ${colors.danger}`,
  },
};

/**
 * Standard button per docs/DESIGN_SYSTEM.md — primary (green fill), secondary
 * (blue outline/tint), danger (red fill). Handles disabled + loading states
 * (spinner + swapped label) so callers don't re-implement it per page.
 */
export function Button({
  variant = 'primary',
  loading = false,
  loadingText,
  fullWidth = false,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        width: fullWidth ? '100%' : undefined,
        padding: `${spacing.sm + 2}px ${spacing.lg}px`,
        borderRadius: radius.button,
        fontSize: 14,
        fontWeight: 600,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        transition: 'opacity 0.15s ease, filter 0.15s ease',
        ...VARIANT_STYLE[variant],
        ...style,
      }}
    >
      {loading && <Spinner />}
      {loading ? (loadingText ?? children) : children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        animation: 'admin-btn-spin 0.7s linear infinite',
      }}
    >
      <style>{`
        @keyframes admin-btn-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}
