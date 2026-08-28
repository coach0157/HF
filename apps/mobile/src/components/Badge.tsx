/**
 * Status/level pill per docs/DESIGN_SYSTEM.md — pill shape (999px radius),
 * semantic color mapping. Used for announcement level, maintenance ticket
 * status, entry/exit status, transport provider type, etc. — screens map
 * their own domain status to one of these 4 variants (see each screen's
 * `..._BADGE_VARIANT` map).
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, variant = "neutral", style }: BadgeProps) {
  const variantStyle = VARIANT_STYLES[variant];
  return (
    <View style={[styles.badge, variantStyle.container, style]}>
      <Text style={[styles.text, variantStyle.text]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
  },
});

const VARIANT_STYLES: Record<
  BadgeVariant,
  { container: StyleProp<ViewStyle>; text: StyleProp<import("react-native").TextStyle> }
> = {
  success: {
    container: { backgroundColor: colors.successLight },
    text: { color: colors.primaryDark },
  },
  warning: {
    container: { backgroundColor: colors.warningLight },
    text: { color: colors.warning },
  },
  danger: {
    container: { backgroundColor: colors.dangerLight },
    text: { color: colors.danger },
  },
  info: {
    container: { backgroundColor: colors.infoLight },
    text: { color: colors.secondaryDark },
  },
  neutral: {
    container: { backgroundColor: colors.border },
    text: { color: colors.textSecondary },
  },
};

export default Badge;
