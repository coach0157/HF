/**
 * Standard button component per docs/DESIGN_SYSTEM.md's "Button variants":
 *  - primary   — solid `primary` bg, white text (action หลักของหน้า)
 *  - secondary — `secondary` border + light-tint bg, `secondary` text (action รอง)
 *  - danger    — solid `danger` bg, white text (revoke/ลบ/logout/SOS)
 * Supports disabled (reduced opacity + blocked touch) and loading
 * (ActivityIndicator swaps in for the label, button stays disabled) states.
 */
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
  testID?: string;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  icon,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const variantStyle = VARIANT_STYLES[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        variantStyle.container,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.spinnerColor} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, variantStyle.label]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});

const VARIANT_STYLES: Record<
  ButtonVariant,
  { container: StyleProp<ViewStyle>; label: StyleProp<import("react-native").TextStyle>; spinnerColor: string }
> = {
  primary: {
    container: { backgroundColor: colors.primary },
    label: { color: colors.white },
    spinnerColor: colors.white,
  },
  secondary: {
    container: {
      backgroundColor: colors.secondaryLight,
      borderWidth: 1,
      borderColor: colors.secondary,
    },
    label: { color: colors.secondaryDark },
    spinnerColor: colors.secondary,
  },
  danger: {
    container: { backgroundColor: colors.danger },
    label: { color: colors.white },
    spinnerColor: colors.white,
  },
};

export default Button;
