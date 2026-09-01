import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { ChannelInfo, MessageChannel } from "@zegbot/shared";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { OnboardingShell } from "@/components/OnboardingShell";
import { PlatformBadge } from "@/components/PlatformBadge";
import { Button } from "@/components/Button";
import { fetchChannels } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CHANNEL_META } from "@/lib/onboarding";

export default function PickChannelScreen() {
  const router = useRouter();
  const { saveOnboarding } = useAuth();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);

  useEffect(() => {
    fetchChannels()
      .then(setChannels)
      .catch(() => {
        setChannels([
          {
            id: "whatsapp",
            name: "WhatsApp",
            description: CHANNEL_META.whatsapp.hint,
            available: true,
            connected: false,
            connectKind: "live",
          },
          {
            id: "messenger",
            name: "Messenger",
            description: CHANNEL_META.messenger.hint,
            available: true,
            connected: false,
            connectKind: "oauth",
          },
        ]);
      });
  }, []);

  const skip = async () => {
    await saveOnboarding({ completed: true });
    router.replace("/(tabs)");
  };

  const pick = async (id: MessageChannel) => {
    await saveOnboarding({ step: "configure", channel: id });
    router.push(`/onboarding/${id}`);
  };

  return (
    <OnboardingShell
      step={1}
      title="Connect your first inbox"
      subtitle="Pick one channel now. You can add more later from Connect."
      onSkip={skip}
    >
      <ScrollView contentContainerStyle={styles.list}>
        {channels.map((channel) => (
          <Pressable
            key={channel.id}
            onPress={() => pick(channel.id)}
            style={styles.card}
          >
            <View style={styles.row}>
              <Text style={styles.name}>{channel.name}</Text>
              <PlatformBadge channel={channel.id} />
            </View>
            <Text style={styles.desc}>{channel.description}</Text>
            {channel.detail ? <Text style={styles.detail}>{channel.detail}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
      <Button title="Skip for now" variant="secondary" onPress={skip} />
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  desc: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  detail: {
    color: colors.textDim,
    fontSize: fontSize.xs,
  },
});
