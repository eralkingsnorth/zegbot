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
  const scrollRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceModeRef = useRef(mode === "voice");
  voiceModeRef.current = mode === "voice";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

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
      }
    },
    [loading, replyAssistant],
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
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: "assistant", text: err }]);
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
    if (!blob.size) {
      setOrbState("idle");
      return;
    }

    setLoading(true);
    try {
      const text = await transcribeVoice(blob);
      setLoading(false);
      await sendText(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not transcribe.";
      setMessages((m) => [...m, { id: `${Date.now()}-e`, role: "assistant", text: msg }]);
      if (voiceModeRef.current) speakText(msg);
      setLoading(false);
      setOrbState("idle");
    }
  }, [sendText]);

  const startRecording = useCallback(async () => {
    if (loading || recording) return;
    stopSpeaking();
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
      setMode("keyboard");
      setMessages((m) => [
        ...m,
        {
          id: `${Date.now()}-mic`,
          role: "assistant",
          text: "Microphone access denied. Use keyboard mode instead.",
        },
      ]);
    }
  }, [loading, recording]);

  const onOrbClick = () => {
    if (mode !== "voice") {
      document.getElementById("home-ai-input")?.focus();
      return;
    }
    if (recording) void stopRecording();
    else void startRecording();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-center gap-3 py-4">
        <button
          type="button"
          onClick={() => {
            stopSpeaking();
            if (recording) void stopRecording();
            setMode("keyboard");
          }}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            mode === "keyboard"
              ? "bg-blue-100 text-blue-700"
              : "text-slate-400 hover:text-slate-600",
          )}
          aria-label="Keyboard mode"
        >
          ⌨
        </button>
        <button
          type="button"
          onClick={() => setMode("voice")}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            mode === "voice"
              ? "bg-violet-100 text-violet-700"
              : "text-slate-400 hover:text-slate-600",
          )}
          aria-label="Voice mode"
        >
          🎤
        </button>
      </div>

      <div className="flex shrink-0 flex-col items-center justify-center py-2">
        <button
          type="button"
          onClick={onOrbClick}
          disabled={loading && !recording}
          className={cn(
            "ai-orb relative flex h-44 w-44 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-70",
            orbState === "listening" && "ai-orb-listening",
            orbState === "thinking" && "ai-orb-thinking",
          )}
          aria-label={mode === "voice" ? "Tap to record" : "Tap to type"}
        >
          <span className="ai-orb-core" />
          <span className="ai-orb-glow" />
          <span className="relative z-10 text-2xl text-white/90">✦</span>
        </button>
        <p className="mt-3 text-center text-xs text-slate-400">
          {loading && !recording
            ? "Thinking..."
            : recording
              ? "Recording… tap again to send"
              : mode === "voice"
                ? "Tap orb to speak"
                : "Tap orb or type below"}
        </p>
      </div>

      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-4">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            <div
              className={cn(
                "max-w-[90%] animate-fade-up rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                msg.role === "user"
                  ? "ml-auto bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-md shadow-blue-200"
                  : "border border-slate-100 bg-white text-slate-700",
              )}
            >
              {msg.text}
            </div>
            {msg.confirmToken && msg.pending ? (
              <div className="flex gap-2">
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
      </div>

      {mode === "keyboard" && (
        <div className="shrink-0 border-t border-slate-200 bg-white/90 p-4 backdrop-blur-md">
          <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <input
              id="home-ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void sendText(input)}
              placeholder="Ask Zegbot anything..."
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
        </div>
      )}
    </div>
  );
}
