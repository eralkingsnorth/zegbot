import { StyleSheet, Text, View } from "react-native";
import { statusTone, type StatusTone } from "@zegbot/theme";
import { colors, radius, fontSize, fontWeight } from "@zegbot/theme";

const toneMap: Record<
  StatusTone,
  { bg: string; text: string; border: string; dot: string }
> = {
  default: {
    bg: "rgba(255,255,255,0.08)",
    text: colors.textMuted,
    border: colors.border,
    dot: colors.textDim,
  },
  success: {
    bg: colors.successSoft,
    text: colors.success,
    border: "rgba(34,197,94,0.25)",
    dot: colors.success,
  },
  warning: {
    bg: "rgba(245,158,11,0.15)",
    text: colors.warning,
    border: "rgba(245,158,11,0.25)",
    dot: colors.warning,
  },
  danger: {
    bg: "rgba(239,68,68,0.15)",
    text: colors.danger,
    border: "rgba(239,68,68,0.25)",
    dot: colors.danger,
  },
  accent: {
    bg: colors.accentSoft,
    text: colors.accent,
    border: "rgba(34,211,238,0.25)",
    dot: colors.accent,
  },
};

export function StatusBadge({ label }: { label: string }) {
  const tone = statusTone(label);
  const t = toneMap[tone];

  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[styles.text, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: "capitalize",
  },
});
