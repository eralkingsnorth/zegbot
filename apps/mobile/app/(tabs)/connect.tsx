import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChannelInfo } from "@zegbot/shared";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { WhatsAppConnect } from "@/components/WhatsAppConnect";
import { MessengerConnect } from "@/components/MessengerConnect";
import { PlatformBadge } from "@/components/PlatformBadge";
import { fetchChannels } from "@/lib/api";

export default function ConnectScreen() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);

  useEffect(() => {
    fetchChannels()
      .then(setChannels)
      .catch(() => {});
  }, []);

  const extras = channels.filter((c) => c.id !== "whatsapp" && c.id !== "messenger");

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Channels</Text>
          <Text style={styles.subtitle}>Link your messaging apps to Zegbot</Text>
          <WhatsAppConnect />
          <MessengerConnect />
          {extras.map((channel) => (
            <View key={channel.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{channel.name}</Text>
                <PlatformBadge channel={channel.id} />
              </View>
              <Text style={styles.desc}>{channel.description}</Text>
              <Text style={styles.later}>{channel.detail || "Coming later"}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
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
  },
  later: { color: colors.textDim, fontSize: fontSize.sm },
});
