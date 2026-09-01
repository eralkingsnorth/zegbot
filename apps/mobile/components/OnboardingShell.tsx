import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { ui } from "@/lib/ui";

export function OnboardingShell({
  step,
  total = 3,
  title,
  subtitle,
  skipLabel = "Skip",
  onSkip,
  children,
}: {
  step: number;
  total?: number;
  title: string;
  subtitle: string;
  skipLabel?: string;
  onSkip?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.wrap}>
          <View style={styles.top}>
            <View style={styles.dots}>
              {Array.from({ length: total }, (_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i < step ? styles.dotOn : styles.dotOff]}
                />
              ))}
            </View>
            {onSkip ? (
              <Pressable onPress={onSkip} hitSlop={8}>
                <Text style={styles.skip}>{skipLabel}</Text>
              </Pressable>
            ) : (
              <View />
            )}
          </View>
          <Text style={ui.title}>{title}</Text>
          <Text style={ui.subtitle}>{subtitle}</Text>
          <View style={styles.body}>{children}</View>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1, padding: spacing.lg, gap: spacing.md },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  dots: { flex: 1, flexDirection: "row", gap: 6 },
  dot: { flex: 1, height: 4, borderRadius: radius.full, maxWidth: 48 },
  dotOn: { backgroundColor: colors.primary },
  dotOff: { backgroundColor: colors.border },
  skip: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  body: { flex: 1, gap: spacing.md },
});
