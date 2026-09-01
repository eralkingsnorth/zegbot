import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { io } from "socket.io-client";
import type { Conversation } from "@zegbot/shared";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { PlatformBadge } from "@/components/PlatformBadge";
import { API_URL, fetchConversations } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function InboxScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [items, setItems] = useState<Conversation[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetchConversations()
      .then(setItems)
      .catch(() => setError("Could not load inbox"));
  }, []);

  useEffect(() => {
    load();
    const socket = io(API_URL);
    socket.on("whatsapp:message", load);
    socket.on("whatsapp:state", load);
    return () => {
      socket.disconnect();
    };
  }, [load]);

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Inbox</Text>
            <Text style={styles.subtitle}>
              {user ? user.email : "Your connected channels"}
            </Text>
          </View>
          <Button title="Log out" variant="secondary" onPress={() => logout()} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyBody}>
                Connect a channel, then messages show up here with a platform label.
              </Text>
              <Button title="Open Channels" onPress={() => router.push("/(tabs)/connect")} />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: "/conversation/[channel]/[contact]",
                  params: { channel: item.channel, contact: item.contact },
                })
              }
            >
              <View style={styles.rowTop}>
                <Text style={styles.contact} numberOfLines={1}>
                  {item.name || item.contact.replace(/@s\.whatsapp\.net$/, "")}
                </Text>
                <PlatformBadge channel={item.channel} />
              </View>
              <Text style={styles.preview} numberOfLines={2}>
                {item.lastMessage}
              </Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.lg,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  contact: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  preview: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
