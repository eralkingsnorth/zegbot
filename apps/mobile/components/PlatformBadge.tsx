import { StyleSheet, Text, View } from "react-native";
import type { MessageChannel } from "@zegbot/shared";
import { fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { CHANNEL_META } from "@/lib/onboarding";

export function PlatformBadge({ channel }: { channel: MessageChannel | string }) {
  const meta = CHANNEL_META[(channel as MessageChannel) ?? "in-app"] ?? CHANNEL_META["in-app"];
  return (
    <View style={[styles.badge, { borderColor: `${meta.color}55`, backgroundColor: `${meta.color}22` }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.text, { color: meta.color }]}>{meta.label}</Text>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
});
