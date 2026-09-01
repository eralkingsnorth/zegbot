import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, fontSize, fontWeight } from "@zegbot/theme";

type Variant = "primary" | "whatsapp" | "secondary";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  if (variant === "primary") {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={[styles.base, style]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, disabled && styles.disabled]}
        >
          <Text style={styles.primaryText}>{title}</Text>
        </LinearGradient>
      </Pressable>
    );
  }

  const variantStyle =
    variant === "whatsapp"
      ? { backgroundColor: colors.whatsapp }
      : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border };

  const textStyle =
    variant === "whatsapp" ? styles.primaryText : styles.secondaryText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, variantStyle, disabled && styles.disabled, style]}
    >
      <Text style={textStyle}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  gradient: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  secondaryText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});
