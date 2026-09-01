import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { OnboardingShell } from "@/components/OnboardingShell";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";

const TONES = [
  { id: "friendly", label: "Friendly" },
  { id: "professional", label: "Professional" },
  { id: "casual", label: "Casual" },
  { id: "concise", label: "Concise" },
];

export default function AiSetupScreen() {
  const router = useRouter();
  const { user, saveOnboarding } = useAuth();
  const [tone, setTone] = useState(user?.aiTone || "friendly");
  const [autoReply, setAutoReply] = useState(user?.aiAutoReply ?? false);
  const [busy, setBusy] = useState(false);

  const finish = async (completed = true) => {
    setBusy(true);
    try {
      await saveOnboarding({
        step: "done",
        completed,
        aiTone: tone,
        aiAutoReply: autoReply,
      });
      router.replace("/(tabs)");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={3}
      title="Optional AI setup"
      subtitle="Choose a reply tone. You can change this later."
      onSkip={() => finish(true)}
    >
      <View style={styles.card}>
        <Text style={styles.label}>Tone</Text>
        <View style={styles.tones}>
          {TONES.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setTone(item.id)}
              style={[styles.tone, tone === item.id && styles.toneOn]}
            >
              <Text style={[styles.toneText, tone === item.id && styles.toneTextOn]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setAutoReply((v) => !v)} style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleTitle}>Auto-reply</Text>
            <Text style={styles.toggleHint}>Draft replies when new chats come in</Text>
          </View>
          <View style={[styles.switch, autoReply && styles.switchOn]}>
            <View style={[styles.knob, autoReply && styles.knobOn]} />
          </View>
        </Pressable>
      </View>
      <Button
        title={busy ? "Saving..." : "Finish and open inbox"}
        onPress={() => finish(true)}
        disabled={busy}
      />
      <Button title="Skip" variant="secondary" onPress={() => finish(true)} />
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tones: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tone: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toneOn: {
    borderColor: colors.primary,
    backgroundColor: "rgba(99,102,241,0.2)",
  },
  toneText: { color: colors.textMuted, fontSize: fontSize.sm },
  toneTextOn: { color: colors.text, fontWeight: fontWeight.medium },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  toggleTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  toggleHint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  switch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  switchOn: { backgroundColor: colors.primary },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  knobOn: { alignSelf: "flex-end" },
});
