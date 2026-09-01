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
  pending?: AiChatResponse["pendingAction"];
  confirmToken?: string;
};

type InputMode = "voice" | "keyboard";

export function HomeAi() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: 'Tap the orb to speak, or switch to keyboard. Try "send hi to Mom".',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<InputMode>("voice");
  const [recording, setRecording] = useState(false);
  const [orbState, setOrbState] = useState<"idle" | "listening" | "thinking">("idle");
  const pulse = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const voiceModeRef = useRef(mode === "voice");
  voiceModeRef.current = mode === "voice";

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
            Animated.timing(pulse, { toValue: 1.12, duration: 600, useNativeDriver: true }),
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

  const replyAssistant = useCallback((data: AiChatResponse, id: string) => {
    setMessages((m) => [
      ...m,
      {
        id,
        role: "assistant",
        text: data.reply,
        pending: data.pendingAction,
        confirmToken: data.confirmToken,
      },
    ]);
    if (voiceModeRef.current) speakText(data.reply);
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      setMessages((m) => [...m, { id: `${Date.now()}-u`, role: "user", text: trimmed }]);
      setLoading(true);
      setOrbState("thinking");
      animateOrb("thinking");
      try {
        const data = await askAi({ message: trimmed });
        replyAssistant(data, `${Date.now()}-a`);
      } catch {
        const err = "Could not reach the API.";
        setMessages((m) => [...m, { id: `${Date.now()}-e`, role: "assistant", text: err }]);
        if (voiceModeRef.current) speakText(err);
      } finally {
        setLoading(false);
        setOrbState("idle");
        animateOrb("idle");
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
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: "assistant", text: err }]);
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
    try {
      await rec.stopAndUnloadAsync();
      recordingRef.current = null;
      const uri = rec.getURI();
      if (!uri) throw new Error("No recording found.");
      const text = await transcribeVoice(uri);
      setLoading(false);
      await sendText(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not transcribe.";
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: "assistant", text: msg }]);
      if (voiceModeRef.current) speakText(msg);
      setLoading(false);
      setOrbState("idle");
      animateOrb("idle");
    }
  }, [animateOrb, sendText]);

  const startRecording = useCallback(async () => {
    if (loading || recording) return;
    stopSpeaking();
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setMode("keyboard");
        setMessages((m) => [
          ...m,
          {
            id: `${Date.now()}-mic`,
            role: "assistant",
            text: "Microphone access denied. Use keyboard mode instead.",
          },
        ]);
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(true);
      setOrbState("listening");
      animateOrb("listening");
    } catch {
      setMode("keyboard");
    }
  }, [loading, recording, animateOrb]);

  const onOrbPress = () => {
    if (mode !== "voice") return;
    if (recording) void stopRecording();
    else void startRecording();
  };

  const spinDeg = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
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

      <Pressable onPress={onOrbPress} disabled={loading && !recording} style={styles.orbWrap}>
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
        <Text style={styles.orbHint}>
          {loading && !recording
            ? "Thinking..."
            : recording
              ? "Recording… tap again to send"
              : mode === "voice"
                ? "Tap orb to speak"
                : "Type below"}
        </Text>
      </Pressable>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.msgBlock}>
            <View
              style={[
                styles.bubble,
                item.role === "user" ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              {item.role === "user" ? (
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
              ) : null}
              <Text style={[styles.bubbleText, item.role === "user" && styles.userBubbleText]}>
                {item.text}
              </Text>
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
        )}
      />

      {mode === "keyboard" && (
        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Zegbot anything..."
            placeholderTextColor={colors.textDim}
            style={styles.input}
            onSubmitEditing={() => void sendText(input)}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => void sendText(input)}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.lg },
  modeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  modeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  modeBtnActive: { backgroundColor: "rgba(59,130,246,0.15)" },
  modeBtnActiveVoice: { backgroundColor: "rgba(139,92,246,0.15)" },
  modeText: { fontSize: fontSize.md, color: colors.textDim },
  modeTextActive: { color: colors.primaryLight },
  modeTextActiveVoice: { color: colors.gradientEnd },
  orbWrap: { alignItems: "center", paddingVertical: spacing.md },
  orb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  orbIcon: { color: "#fff", fontSize: 28 },
  orbHint: { marginTop: spacing.sm, color: colors.textMuted, fontSize: fontSize.xs },
  list: { flex: 1 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.md },
  msgBlock: { gap: spacing.xs },
  bubble: {
    maxWidth: "90%",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    overflow: "hidden",
  },
  userBubble: { alignSelf: "flex-end" },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.assistantBubble,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  userBubbleText: { color: "#fff" },
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.sm,
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
