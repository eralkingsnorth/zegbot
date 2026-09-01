import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { io } from "socket.io-client";
import type { MessageChannel, StoredMessage } from "@zegbot/shared";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { PlatformBadge } from "@/components/PlatformBadge";
import {
  API_URL,
  askAi,
  fetchThread,
  sendChannelMessage,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ConversationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { channel, contact } = useLocalSearchParams<{
    channel: string;
    contact: string;
  }>();
  const ch = (channel ?? "whatsapp") as MessageChannel;
  const to = contact ?? "";
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [text, setText] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!ch || !to) return;
    fetchThread(ch, to)
      .then((list) => setMessages([...list].reverse()))
      .catch(() => setError("Could not load chat"));
  }, [ch, to]);

  useEffect(() => {
    load();
    const socket = io(API_URL);
    socket.on("whatsapp:message", load);
    return () => {
      socket.disconnect();
    };
  }, [load]);

  const send = async (body?: string) => {
    const message = (body ?? text).trim();
    if (!message) return;
    setBusy(true);
    setError("");
    try {
      await sendChannelMessage(ch, to, message);
      setText("");
      setAiReply("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  const help = async () => {
    setBusy(true);
    setError("");
    try {
      const context = messages
        .slice(-12)
        .map((m) => `${m.direction === "out" ? "Me" : m.from}: ${m.body}`)
        .join("\n");
      const res = await askAi({
        message: "Suggest a helpful reply to this conversation.",
        context,
        tone: user?.aiTone,
      });
      setAiReply(res.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.back}>Back</Text>
            </Pressable>
            <View style={styles.headerMid}>
              <Text style={styles.title} numberOfLines={1}>
                {to.replace(/@s\.whatsapp\.net$/, "")}
              </Text>
              <PlatformBadge channel={ch} />
            </View>
          </View>

          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  item.direction === "out" ? styles.out : styles.in,
                ]}
              >
                <Text style={styles.bubbleText}>{item.body}</Text>
              </View>
            )}
          />

          {aiReply ? (
            <View style={styles.aiBox}>
              <Text style={styles.aiLabel}>AI suggestion</Text>
              <Text style={styles.aiText}>{aiReply}</Text>
              <Button title="Send this reply" onPress={() => send(aiReply)} disabled={busy} />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={`Message via ${ch}`}
              placeholderTextColor={colors.textDim}
              style={styles.input}
              onSubmitEditing={() => send()}
              returnKeyType="send"
            />
            <Button title="Send" onPress={() => send()} disabled={busy} />
          </View>
          <View style={styles.aiBtn}>
            <Button
              title={busy ? "Working..." : "Ask AI"}
              variant="secondary"
              onPress={help}
              disabled={busy}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  back: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  headerMid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  in: {
    alignSelf: "flex-start",
    backgroundColor: colors.assistantBubble,
    borderWidth: 1,
    borderColor: colors.border,
  },
  out: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  bubbleText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  aiBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  aiLabel: {
    color: colors.primaryLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: "uppercase",
  },
  aiText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  aiBtn: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
});
