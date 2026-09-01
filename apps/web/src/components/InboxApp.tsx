"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { Conversation, MessageAttachment, MessageChannel, StoredMessage } from "@zegbot/shared";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { PlatformBadge, displayContact, initials } from "@/components/PlatformBadge";
import {
  API,
  askAi,
  fetchConversations,
  fetchThread,
  markConversationRead,
  mediaUrl,
  sendInboxMessage,
} from "@/lib/api";

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤗","🤔",
  "😅","😭","😡","👍","👎","👏","🙏","🔥","✨","💯",
  "❤️","💙","💜","✅","❌","🎉","📷","🎵","📎","👋",
];

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function InboxApp() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [aiReply, setAiReply] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const loadList = useCallback(async () => {
    try {
      const list = await fetchConversations();
      setItems(list);
      setSelected((cur) => {
        if (!cur) return cur;
        return list.find((c) => c.id === cur.id) ?? cur;
      });
    } catch {
      setError("Could not load inbox");
    }
  }, []);

  const loadThread = useCallback(async (conv: Conversation) => {
    const list = await fetchThread(conv.channel, conv.contact);
    setMessages([...list].reverse());
    await markConversationRead(conv.channel, conv.contact);
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadList();
    const socket = io(API);
    socket.on("inbox:message", () => void loadList());
    socket.on("whatsapp:message", () => void loadList());
    socket.on("inbox:read", () => void loadList());
    socket.on("inbox:sync", () => void loadList());
    return () => {
      socket.disconnect();
    };
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    void loadThread(selected);
    const socket = io(API);
    const refresh = () => void loadThread(selected);
    socket.on("inbox:message", refresh);
    socket.on("whatsapp:message", refresh);
    socket.on("inbox:sync", refresh);
    return () => {
      socket.disconnect();
    };
  }, [selected?.id, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        displayContact(c.contact).toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q) ||
        c.channel.includes(q),
    );
  }, [items, query]);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setPending((cur) => [...cur, ...Array.from(list)].slice(0, 5));
  };

  const send = async (text = draft) => {
    if (!selected) return;
    const body = text.trim();
    if (!body && pending.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await sendInboxMessage({
        channel: selected.channel,
        to: selected.contact,
        body,
        files: pending,
      });
      setDraft("");
      setPending([]);
      setAiReply("");
      setEmojiOpen(false);
      await loadThread(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  };

  const help = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const context = messages
        .slice(-16)
        .map((m) => `${m.direction === "out" ? "Me" : displayContact(m.from)}: ${m.body}`)
        .join("\n");
      const res = await askAi({
        message: "Suggest a helpful, short reply to this conversation.",
        context,
      });
      setAiReply(res.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        setPending((cur) => [...cur, file].slice(0, 5));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      audioRef.current?.click();
    }
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white">
      <aside className={cn(
        "flex w-full shrink-0 flex-col border-r border-slate-200 bg-white md:w-[360px]",
        selected && "hidden md:flex",
      )}>
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Inbox</h2>
              <p className="text-xs text-slate-400">All chats, every platform</p>
            </div>
            <div className="flex items-center gap-2">
              {items.some((c) => c.unreadCount > 0) && (
                <span className="rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {items.reduce((n, c) => n + c.unreadCount, 0)} new
                </span>
              )}
              <button
                type="button"
                onClick={() => setNewOpen((v) => !v)}
                className="rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-1 text-xs font-semibold text-white"
              >
                New
              </button>
            </div>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          {newOpen && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">Start a WhatsApp chat</p>
              <input
                value={newTo}
                onChange={(e) => setNewTo(e.target.value)}
                placeholder="Phone with country code"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
              <Button
                className="mt-2 w-full"
                onClick={() => {
                  const digits = newTo.replace(/\D/g, "");
                  if (digits.length < 8) return;
                  const contact = `${digits}@s.whatsapp.net`;
                  setSelected({
                    id: `whatsapp:${contact}`,
                    channel: "whatsapp",
                    contact,
                    lastMessage: "",
                    lastTimestamp: new Date().toISOString(),
                    lastDirection: "out",
                    unreadCount: 0,
                  });
                  setMessages([]);
                  setNewTo("");
                  setNewOpen(false);
                }}
              >
                Open chat
              </Button>
            </div>
          )}
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="font-semibold text-slate-800">No chats yet</p>
              <p className="mt-1 text-sm text-slate-400">
                Connect a channel, then messages appear here with a platform label.
              </p>
            </div>
          )}
          {filtered.map((item) => {
            const active = selected?.id === item.id;
            const unread = item.unreadCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition",
                  active
                    ? "bg-gradient-to-r from-blue-50 to-violet-50"
                    : "hover:bg-slate-50",
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-sm font-bold text-white">
                  {initials(item.name || item.contact)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn("truncate text-sm", unread ? "font-bold text-slate-900" : "font-medium text-slate-800")}>
                      {item.name || displayContact(item.contact)}
                    </p>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                      {formatTime(item.lastTimestamp)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <PlatformBadge channel={item.channel} />
                    {unread && (
                      <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {item.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className={cn("mt-1 truncate text-xs", unread ? "font-medium text-slate-700" : "text-slate-400")}>
                    {item.lastDirection === "out" ? "You: " : ""}
                    {item.lastMessage || "Attachment"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={cn("flex min-w-0 flex-1 flex-col bg-slate-50", !selected && "hidden md:flex")}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 text-2xl text-white shadow-lg shadow-blue-200">
              ✉
            </div>
            <h3 className="text-xl font-bold text-slate-900">Pick a conversation</h3>
            <p className="mt-2 max-w-sm text-sm text-slate-400">
              All WhatsApp, Messenger, and other chats live here. Unread ones stay bold until you open them.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-slate-500 md:hidden"
                onClick={() => setSelected(null)}
              >
                ←
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-sm font-bold text-white">
                {initials(selected.name || selected.contact)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {selected.name || displayContact(selected.contact)}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <PlatformBadge channel={selected.channel as MessageChannel} />
                  <span className="text-[11px] text-slate-400">Send as this platform</span>
                </div>
              </div>
              <Button variant="secondary" onClick={help} disabled={busy} className="shrink-0">
                Ask AI
              </Button>
            </header>

            <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {messages.map((msg) => (
                <Bubble
                  key={msg.id}
                  msg={msg}
                  onOpenImage={(url) => setLightbox(url)}
                />
              ))}
              <div ref={bottomRef} />
            </div>

            {aiReply && (
              <div className="mx-4 mb-2 rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">AI suggestion</p>
                <p className="mt-1 text-sm text-slate-700">{aiReply}</p>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => send(aiReply)} disabled={busy}>Send this</Button>
                  <Button variant="ghost" onClick={() => setAiReply("")}>Dismiss</Button>
                </div>
              </div>
            )}

            {error && <p className="px-4 pb-1 text-sm text-red-500">{error}</p>}

            {pending.length > 0 && (
              <div className="flex gap-2 overflow-x-auto px-4 pb-2">
                {pending.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="relative rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-600">
                    {file.type.startsWith("image/") ? "Photo" : file.type.startsWith("audio/") ? "Audio" : file.name}
                    <button
                      type="button"
                      className="ml-2 text-slate-400 hover:text-red-500"
                      onClick={() => setPending((cur) => cur.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative border-t border-slate-200 bg-white p-3">
              {emojiOpen && (
                <div className="absolute bottom-16 left-3 z-20 grid w-72 grid-cols-8 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="rounded-lg p-1 text-lg hover:bg-slate-50"
                      onClick={() => setDraft((d) => d + e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <button type="button" className="composer-icon" title="Emoji" onClick={() => setEmojiOpen((v) => !v)}>😊</button>
                <button type="button" className="composer-icon" title="File" onClick={() => fileRef.current?.click()}>📎</button>
                <button type="button" className="composer-icon" title="Photo" onClick={() => imageRef.current?.click()}>🖼️</button>
                <button
                  type="button"
                  className={cn("composer-icon", recording && "text-red-500")}
                  title={recording ? "Stop recording" : "Voice"}
                  onClick={() => void toggleRecord()}
                >
                  {recording ? "■" : "🎤"}
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder={`Message via ${selected.channel}`}
                  className="max-h-28 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                <Button onClick={() => void send()} disabled={busy} className="shrink-0">
                  Send
                </Button>
              </div>
              <input ref={fileRef} type="file" className="hidden" multiple onChange={(e) => addFiles(e.target.files)} />
              <input ref={imageRef} type="file" accept="image/*" className="hidden" multiple onChange={(e) => addFiles(e.target.files)} />
              <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </div>
          </>
        )}
      </section>

      {lightbox && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-2xl shadow-2xl" />
        </button>
      )}
    </div>
  );
}

function Bubble({
  msg,
  onOpenImage,
}: {
  msg: StoredMessage;
  onOpenImage: (url: string) => void;
}) {
  const mine = msg.direction === "out";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
          mine
            ? "rounded-br-md bg-gradient-to-br from-blue-500 to-violet-600 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-800",
        )}
      >
        {msg.attachments?.map((att) => (
          <AttachmentBlock key={att.id} att={att} mine={mine} onOpenImage={onOpenImage} />
        ))}
        {msg.body && msg.body !== "[photo]" && msg.body !== "[voice message]" && msg.body !== "[attachment]" ? (
          <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
        ) : !msg.attachments?.length && msg.body === "[photo]" ? (
          <p className={cn("italic", mine ? "text-white/80" : "text-slate-500")}>Photo</p>
        ) : !msg.attachments?.length && msg.body === "[voice message]" ? (
          <p className={cn("italic", mine ? "text-white/80" : "text-slate-500")}>Voice message</p>
        ) : null}
        <p className={cn("mt-1 text-[10px]", mine ? "text-white/70" : "text-slate-400")}>
          {formatClock(msg.timestamp)}
        </p>
      </div>
    </div>
  );
}

function AttachmentBlock({
  att,
  mine,
  onOpenImage,
}: {
  att: MessageAttachment;
  mine: boolean;
  onOpenImage: (url: string) => void;
}) {
  const url = mediaUrl(att.url);
  if (att.kind === "image") {
    return (
      <button type="button" className="mb-2 block overflow-hidden rounded-xl" onClick={() => onOpenImage(url)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={att.name} className="max-h-56 max-w-full object-cover" />
      </button>
    );
  }
  if (att.kind === "audio") {
    return <audio controls src={url} className="mb-2 max-w-full" />;
  }
  return (
    <a
      href={url}
      download={att.name}
      className={cn(
        "mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium",
        mine ? "bg-white/15" : "bg-slate-50",
      )}
    >
      📎 {att.name}
    </a>
  );
}
