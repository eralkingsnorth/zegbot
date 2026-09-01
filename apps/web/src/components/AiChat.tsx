"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ChatMessage = { role: "user" | "assistant"; text: string };

export function AiChat({ fullHeight = false }: { fullHeight?: boolean }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: 'Hi! Try "what are my new messages today?" or "send hello to 1234567890".',
    },
  ]);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Could not reach the API." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard
      strong
      className={`flex flex-col p-0 animate-fade-up ${fullHeight ? "min-h-[calc(100vh-220px)]" : "h-[560px]"}`}
    >
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 text-sm text-white">
            ✦
          </span>
          <div>
            <h2 className="font-semibold tracking-tight text-slate-900">AI Assistant</h2>
            <p className="text-xs text-slate-400">Summarize & send across channels</p>
          </div>
        </div>
      </div>

      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[88%] animate-fade-up rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "ml-auto bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-md shadow-blue-200"
                : "border border-slate-100 bg-slate-50 text-slate-700"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="h-2 w-2 animate-pulse-soft rounded-full bg-blue-400" />
            Thinking...
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 p-4">
        <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about messages or send one..."
            className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <Button onClick={send} disabled={loading} className="shrink-0 px-5">
            Send
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
