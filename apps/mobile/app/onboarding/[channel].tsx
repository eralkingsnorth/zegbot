import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { MessageChannel } from "@zegbot/shared";
import { colors, fontSize, radius, spacing } from "@zegbot/theme";
import { OnboardingShell } from "@/components/OnboardingShell";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";
import { MessengerConnect } from "@/components/MessengerConnect";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { CHANNEL_META } from "@/lib/onboarding";

export default function ChannelSetupScreen() {
  const router = useRouter();
  const { saveOnboarding } = useAuth();
  const { channel } = useLocalSearchParams<{ channel: string }>();
  const id = (channel ?? "whatsapp") as MessageChannel;
  const meta = CHANNEL_META[id] ?? CHANNEL_META.whatsapp;

  const skip = async () => {
    await saveOnboarding({ completed: true });
    router.replace("/(tabs)");
  };

  const next = async () => {
    await saveOnboarding({ step: "ai", channel: id });
    router.push("/onboarding/ai");
  };

  return (
    <OnboardingShell
      step={2}
      title={`Set up ${meta.label}`}
      subtitle={meta.hint}
      onSkip={skip}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {id === "whatsapp" ? <WhatsAppConnect /> : null}

        {id === "messenger" ? <MessengerConnect /> : null}

        {id === "telegram" || id === "email" ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              {meta.label} is not live on this server yet. Continue to finish setup,
              then connect it later from the Connect tab.
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <Button title="Continue" onPress={next} />
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  body: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
