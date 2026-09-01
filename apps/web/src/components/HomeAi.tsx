"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiChatResponse } from "@zegbot/shared";
import { cn } from "@/lib/cn";
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

function ModeToggle({
  mode,
  onKeyboard,
  onVoice,
}: {
  mode: InputMode;
  onKeyboard: () => void;
  onVoice: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={onKeyboard}
        aria-label="Keyboard"
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-lg transition",
          mode === "keyboard"
            ? "bg-blue-100 text-blue-700 shadow-sm"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
        )}
      >
        ⌨
      </button>
      <button
        type="button"
        onClick={onVoice}
        aria-label="Microphone"
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-lg transition",
          mode === "voice"
            ? "bg-violet-100 text-violet-700 shadow-sm"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
        )}
      >
        🎤
      </button>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const mine = msg.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] animate-fade-up rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
          mine
            ? "bg-gradient-to-br from-blue-500 to-violet-600 text-white"
            : "border border-slate-100 bg-white text-slate-700",
        )}
      >
        {msg.voice && mine ? (
          <span className="mb-1 block text-xs opacity-80">🎤 Voice</span>
        ) : null}
        {msg.text}
      </div>
      <span className="px-1 text-[10px] text-slate-400">{formatTime(msg.at)}</span>
    </div>
  );
}

export function HomeAi() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<InputMode>("voice");
  const [recording, setRecording] = useState(false);
  const [orbState, setOrbState] = useState<"idle" | "listening" | "thinking">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingVoiceIdRef = useRef<string | null>(null);
  const voiceModeRef = useRef(mode === "voice");
  voiceModeRef.current = mode === "voice";

  const hasThread = messages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, mode]);

  useEffect(() => () => {
    stopSpeaking();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

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
            msg.id === userMsg.id
              ? { ...msg, text: trimmed, voice: userMsg.voice }
              : msg,
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
        pendingVoiceIdRef.current = null;
      }
    },
    [loading, replyAssistant],
  );

  const sendText = useCallback(
    (text: string) => void runAi(text),
    [runAi],
  );

  const confirm = async (token: string, msgId: string) => {
    setLoading(true);
    setOrbState("thinking");
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
    }
  };

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    setRecording(false);
    setOrbState("thinking");

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;

    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
    chunksRef.current = [];
    const voiceId = pendingVoiceIdRef.current;

    if (!blob.size) {
      if (voiceId) {
        setMessages((m) => m.filter((msg) => msg.id !== voiceId));
        pendingVoiceIdRef.current = null;
      }
      setOrbState("idle");
      return;
    }

    if (voiceId) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === voiceId ? { ...msg, text: "Transcribing…" } : msg,
        ),
      );
    }

    setLoading(true);
    try {
      const text = await transcribeVoice(blob);
      setLoading(false);
      if (voiceId) {
        await runAi(text, { id: voiceId, voice: true });
      } else {
        await runAi(text);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not transcribe.";
      if (voiceId) {
        setMessages((m) => m.filter((x) => x.id !== voiceId));
      }
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: "assistant", text: msg, at: now() }]);
      if (voiceModeRef.current) speakText(msg);
      setLoading(false);
      setOrbState("idle");
      pendingVoiceIdRef.current = null;
    }
  }, [runAi]);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setOrbState("listening");
    } catch {
      pendingVoiceIdRef.current = null;
      setMessages((m) => m.filter((msg) => msg.id !== voiceId));
      setMode("keyboard");
      setMessages((m) => [
        ...m,
        {
          id: `${Date.now()}-mic`,
          role: "assistant",
          text: "Microphone access denied. Use keyboard mode instead.",
          at: now(),
        },
      ]);
    }
  }, [loading, recording]);

  const switchToKeyboard = () => {
    stopSpeaking();
    if (recording) void stopRecording();
    setMode("keyboard");
  };

  const switchToVoice = () => {
    setMode("voice");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {mode === "keyboard" || hasThread ? (
        <div
          ref={scrollRef}
          className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 && mode === "keyboard" ? (
            <p className="text-center text-sm text-slate-400">
              Ask Zegbot to send, summarize, or manage your chats.
            </p>
          ) : null}
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              <MessageBubble msg={msg} />
              {msg.confirmToken && msg.pending ? (
                <div className="flex gap-2 pl-1">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void confirm(msg.confirmToken!, msg.id)}
                    className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <span className="self-center text-xs text-slate-400">{msg.pending.label}</span>
                </div>
              ) : null}
            </div>
          ))}
          {loading && !recording ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="h-2 w-2 animate-pulse-soft rounded-full bg-blue-400" />
              Thinking…
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-sm text-slate-400">
            Tap the mic below and speak. Your messages will show here.
          </p>
        </div>
      )}

      <div className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md">
        <ModeToggle mode={mode} onKeyboard={switchToKeyboard} onVoice={switchToVoice} />

        {mode === "keyboard" ? (
          <div className="mt-3 flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <input
              id="home-ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendText(input)}
              placeholder="Ask Zegbot anything…"
              className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => void sendText(input)}
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col items-center gap-2 pb-1">
            <button
              type="button"
              onClick={() => {
                if (recording) void stopRecording();
                else void startRecording();
              }}
              disabled={loading && !recording}
              className={cn(
                "ai-orb ai-orb-sm relative flex items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-70",
                orbState === "listening" && "ai-orb-listening",
                orbState === "thinking" && "ai-orb-thinking",
              )}
              aria-label="Tap to record"
            >
              <span className="ai-orb-core" />
              <span className="ai-orb-glow" />
              <span className="relative z-10 text-lg text-white/90">✦</span>
            </button>
            <p className="text-center text-xs text-slate-400">
              {loading && !recording
                ? "Thinking…"
                : recording
                  ? "Tap again to send"
                  : "Tap to speak"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
