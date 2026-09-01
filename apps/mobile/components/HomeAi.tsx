import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Audio } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import type { AiChatResponse } from "@zegbot/shared";
import { colors, fontSize, fontWeight, radius, spacing } from "@zegbot/theme";
import { askAi, confirmAiAction, transcribeVoice } from "@/lib/api";
import { speakText, stopSpeaking } from "@/lib/speak";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  voice?: boolean;
  at: string;
  pending?: AiChatResponse["pendingAction"];
  confirmToken?: string;
};

type InputMode = "voice" | "keyboard";

function now() {
  return new Date().toISOString();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HomeAi() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<InputMode>("voice");
  const [recording, setRecording] = useState(false);
  const [orbState, setOrbState] = useState<"idle" | "listening" | "thinking">("idle");
  const pulse = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pendingVoiceIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const voiceModeRef = useRef(mode === "voice");
  voiceModeRef.current = mode === "voice";

  const hasThread = messages.length > 0;

  const animateOrb = useCallback(
    (state: "idle" | "listening" | "thinking") => {
      pulse.stopAnimation();
      spin.stopAnimation();
      if (state === "idle") {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 2000, useNativeDriver: true }),
          ]),
        ).start();
      } else if (state === "listening") {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1.1, duration: 600, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
          ]),
        ).start();
      } else {
        Animated.loop(
          Animated.timing(spin, {
            toValue: 1,
            duration: 1500,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ).start();
      }
    },
    [pulse, spin],
  );

  useEffect(() => {
    animateOrb("idle");
    return () => {
      stopSpeaking();
      void recordingRef.current?.stopAndUnloadAsync();
    };
  }, [animateOrb]);

  useEffect(() => {
    if (messages.length) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages, loading, mode]);

  const replyAssistant = useCallback((data: AiChatResponse, id: string) => {
    setMessages((m) => [
      ...m,
      {
        id,
        role: "assistant",
        text: data.reply,
        at: now(),
        pending: data.pendingAction,
        confirmToken: data.confirmToken,
      },
    ]);
    if (voiceModeRef.current) speakText(data.reply);
  }, []);

  const runAi = useCallback(
    async (text: string, userMsg?: { id: string; voice?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      if (userMsg) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === userMsg.id ? { ...msg, text: trimmed, voice: userMsg.voice } : msg,
          ),
        );
      } else {
        setInput("");
        setMessages((m) => [
          ...m,
          { id: `${Date.now()}-u`, role: "user", text: trimmed, at: now() },
        ]);
      }

      setLoading(true);
      setOrbState("thinking");
      animateOrb("thinking");
      try {
        const data = await askAi({ message: trimmed });
        replyAssistant(data, `${Date.now()}-a`);
      } catch {
        const err = "Could not reach the API.";
        setMessages((m) => [
          ...m,
          { id: `${Date.now()}-e`, role: "assistant", text: err, at: now() },
        ]);
        if (voiceModeRef.current) speakText(err);
      } finally {
        setLoading(false);
        setOrbState("idle");
        animateOrb("idle");
        pendingVoiceIdRef.current = null;
      }
    },
    [loading, animateOrb, replyAssistant],
  );

  const confirm = async (token: string, msgId: string) => {
    setLoading(true);
    setOrbState("thinking");
    animateOrb("thinking");
    try {
      const data = await confirmAiAction(token);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === msgId
            ? { ...msg, text: data.reply, pending: undefined, confirmToken: undefined }
            : msg,
        ),
      );
      if (voiceModeRef.current) speakText(data.reply);
    } catch {
      const err = "Could not confirm action.";
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: "assistant", text: err, at: now() }]);
      if (voiceModeRef.current) speakText(err);
    } finally {
      setLoading(false);
      setOrbState("idle");
      animateOrb("idle");
    }
  };

  const stopRecording = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return;
    setRecording(false);
    setOrbState("thinking");
    animateOrb("thinking");
    setLoading(true);
    const voiceId = pendingVoiceIdRef.current;
    try {
      await rec.stopAndUnloadAsync();
      recordingRef.current = null;
      const uri = rec.getURI();
      if (!uri) throw new Error("No recording found.");
      if (voiceId) {
        setMessages((m) =>
          m.map((msg) => (msg.id === voiceId ? { ...msg, text: "Transcribing…" } : msg)),
        );
      }
      const text = await transcribeVoice(uri);
      setLoading(false);
      if (voiceId) {
        await runAi(text, { id: voiceId, voice: true });
      } else {
        await runAi(text);
      }
    } catch (err) {
      if (voiceId) {
        setMessages((m) => m.filter((x) => x.id !== voiceId));
      }
      const msg = err instanceof Error ? err.message : "Could not transcribe.";
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: "assistant", text: msg, at: now() }]);
      if (voiceModeRef.current) speakText(msg);
      setLoading(false);
      setOrbState("idle");
      animateOrb("idle");
      pendingVoiceIdRef.current = null;
    }
  }, [animateOrb, runAi]);

  const startRecording = useCallback(async () => {
    if (loading || recording) return;
    stopSpeaking();
    const voiceId = `${Date.now()}-voice`;
    pendingVoiceIdRef.current = voiceId;
    setMessages((m) => [
      ...m,
      { id: voiceId, role: "user", text: "Recording…", voice: true, at: now() },
    ]);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        pendingVoiceIdRef.current = null;
        setMessages((m) => m.filter((msg) => msg.id !== voiceId));
        setMode("keyboard");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(true);
      setOrbState("listening");
      animateOrb("listening");
    } catch {
      pendingVoiceIdRef.current = null;
      setMessages((m) => m.filter((msg) => msg.id !== voiceId));
      setMode("keyboard");
    }
  }, [loading, recording, animateOrb]);

  const spinDeg = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const mine = item.role === "user";
    return (
      <View style={styles.msgBlock}>
        <View style={[styles.msgRow, mine && styles.msgRowMine]}>
          <View style={[styles.bubble, mine ? styles.userBubble : styles.assistantBubble]}>
            {mine ? (
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            ) : null}
            {item.voice && mine ? (
              <Text style={[styles.voiceTag, mine && styles.userBubbleText]}>🎤 Voice</Text>
            ) : null}
            <Text style={[styles.bubbleText, mine && styles.userBubbleText]}>{item.text}</Text>
          </View>
          <Text style={styles.time}>{formatTime(item.at)}</Text>
        </View>
        {item.confirmToken && item.pending ? (
          <Pressable
            style={styles.confirmBtn}
            disabled={loading}
            onPress={() => void confirm(item.confirmToken!, item.id)}
          >
            <Text style={styles.confirmText}>Confirm</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {mode === "keyboard" || hasThread ? (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            mode === "keyboard" ? (
              <Text style={styles.empty}>Ask Zegbot to send, summarize, or manage your chats.</Text>
            ) : null
          }
          ListFooterComponent={
            loading && !recording ? <Text style={styles.thinking}>Thinking…</Text> : null
          }
          renderItem={renderMessage}
        />
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>Tap the mic below and speak. Your messages will show here.</Text>
        </View>
      )}

      <View style={styles.dock}>
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => {
              stopSpeaking();
              if (recording) void stopRecording();
              setMode("keyboard");
            }}
            style={[styles.modeBtn, mode === "keyboard" && styles.modeBtnActive]}
          >
            <Text style={[styles.modeText, mode === "keyboard" && styles.modeTextActive]}>⌨</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("voice")}
            style={[styles.modeBtn, mode === "voice" && styles.modeBtnActiveVoice]}
          >
            <Text style={[styles.modeText, mode === "voice" && styles.modeTextActiveVoice]}>🎤</Text>
          </Pressable>
        </View>

        {mode === "keyboard" ? (
          <View style={styles.inputWrap}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask Zegbot anything…"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              onSubmitEditing={() => void runAi(input)}
              returnKeyType="send"
            />
            <Pressable
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => void runAi(input)}
              disabled={!input.trim() || loading}
            >
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.orbDock}>
            <Pressable
              onPress={() => {
                if (recording) void stopRecording();
                else void startRecording();
              }}
              disabled={loading && !recording}
            >
              <Animated.View style={{ transform: [{ scale: pulse }, { rotate: spinDeg }] }}>
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd, "#06b6d4"]}
                  style={styles.orb}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.orbIcon}>✦</Text>
                </LinearGradient>
              </Animated.View>
            </Pressable>
            <Text style={styles.orbHint}>
              {loading && !recording
                ? "Thinking…"
                : recording
                  ? "Tap again to send"
                  : "Tap to speak"}
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.lg },
  list: { flex: 1 },
  listContent: { gap: spacing.md, paddingVertical: spacing.md, paddingBottom: spacing.sm },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  empty: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center", lineHeight: 20 },
  thinking: { color: colors.textMuted, fontSize: fontSize.sm, paddingTop: spacing.sm },
  dock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  modeRow: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  modeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBtnActive: { backgroundColor: "rgba(59,130,246,0.15)" },
  modeBtnActiveVoice: { backgroundColor: "rgba(139,92,246,0.15)" },
  modeText: { fontSize: fontSize.lg, color: colors.textDim },
  modeTextActive: { color: colors.primaryLight },
  modeTextActiveVoice: { color: colors.gradientEnd },
  orbDock: { alignItems: "center", gap: spacing.xs },
  orb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  orbIcon: { color: "#fff", fontSize: 22 },
  orbHint: { color: colors.textMuted, fontSize: fontSize.xs },
  msgBlock: { gap: spacing.xs },
  msgRow: { alignItems: "flex-start", gap: 4, maxWidth: "88%" },
  msgRowMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    overflow: "hidden",
  },
  userBubble: { alignSelf: "flex-end" },
  assistantBubble: {
    backgroundColor: colors.assistantBubble,
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceTag: { fontSize: fontSize.xs, marginBottom: 2, opacity: 0.85 },
  bubbleText: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  userBubbleText: { color: "#fff" },
  time: { fontSize: 10, color: colors.textDim },
  confirmBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  confirmText: { color: "#fff", fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
});
