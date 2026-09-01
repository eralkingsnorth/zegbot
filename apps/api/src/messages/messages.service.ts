import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import type {
  Conversation,
  MessageAttachment,
  MessageChannel,
  StoredMessage,
} from '@zegbot/shared';

const MAX_MESSAGES = 20_000;

@Injectable()
export class MessagesService extends EventEmitter implements OnModuleInit {
  private readonly logger = new Logger(MessagesService.name);
  private messages: StoredMessage[] = [];
  private chats = new Map<string, Conversation>();
  private names = new Map<string, { name: string; saved: boolean }>();
  private readonly file: string;
  private readonly chatsFile: string;
  private readonly namesFile: string;
  private writing = false;
  private namesTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: ConfigService) {
    super();
    const dataDir =
      this.config.get<string>('DATA_DIR') ?? join(process.cwd(), '..', '..', 'data');
    this.file = join(dataDir, 'messages.json');
    this.chatsFile = join(dataDir, 'conversations.json');
    this.namesFile = join(dataDir, 'contacts.json');
  }

  async onModuleInit() {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as StoredMessage[];
      this.messages = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.messages = [];
    }
    try {
      const raw = await readFile(this.chatsFile, 'utf8');
      const parsed = JSON.parse(raw) as Conversation[];
      if (Array.isArray(parsed)) {
        for (const chat of parsed) this.chats.set(chat.id, chat);
      }
    } catch {
      this.chats.clear();
    }
    try {
      const raw = await readFile(this.namesFile, 'utf8');
      const parsed = JSON.parse(raw) as Record<
        string,
        string | { name: string; saved?: boolean }
      >;
      for (const [id, value] of Object.entries(parsed ?? {})) {
        if (typeof value === 'string') {
          if (value.trim()) this.names.set(id, { name: value.trim(), saved: true });
        } else if (value?.name?.trim()) {
          this.names.set(id, {
            name: value.name.trim(),
            saved: Boolean(value.saved),
          });
        }
      }
    } catch {
      this.names.clear();
    }
    this.dropPlaceholderWhatsAppChats();
  }

  add(message: StoredMessage) {
    const stored: StoredMessage = {
      ...message,
      read: message.read ?? message.direction === 'out',
      attachments: message.attachments ?? [],
    };
    const existing = this.messages.findIndex(
      (m) => m.channel === stored.channel && m.id === stored.id,
    );
    if (existing >= 0) {
      const prev = this.messages[existing];
      const attachments = stored.attachments?.length
        ? stored.attachments
        : prev.attachments;
      let body = stored.body ?? prev.body;
      if (attachments?.length && isMediaPlaceholder(body)) body = '';
      this.messages[existing] = { ...prev, ...stored, attachments, body };
      void this.persist();
      this.emit('message', this.messages[existing]);
      return this.messages[existing];
    }
    const recent = this.messages.find((m) => isSameBubble(m, stored));
    if (recent) {
      if (stored.id && stored.id !== recent.id && stored.id.length > 10) {
        recent.id = stored.id;
      }
      if (stored.attachments?.length) {
        recent.attachments = stored.attachments;
        if (isMediaPlaceholder(recent.body)) recent.body = '';
      }
      void this.persist();
      this.emit('message', recent);
      return recent;
    }
    this.messages.unshift(stored);
    this.trim();
    void this.persist();
    this.emit('message', stored);
    return stored;
  }

  /** Bulk import (WhatsApp history sync). Skips duplicates and emits once. */
  addMany(list: StoredMessage[]): number {
    const seen = new Set(this.messages.map((m) => `${m.channel}:${m.id}`));
    let added = 0;
    let patched = 0;
    for (const message of list) {
      const key = `${message.channel}:${message.id}`;
      if (seen.has(key)) {
        if (message.attachments?.length) {
          this.add(message);
          patched += 1;
        }
        continue;
      }
      seen.add(key);
      this.messages.push({
        ...message,
        read: message.read ?? message.direction === 'out',
        attachments: message.attachments ?? [],
      });
      added += 1;
    }
    if (added === 0 && patched === 0) return 0;
    this.messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    this.trim();
    void this.persist();
    this.emit('sync', { added: added + patched });
    return added + patched;
  }

  private trim() {
    if (this.messages.length > MAX_MESSAGES) {
      this.messages.length = MAX_MESSAGES;
    }
  }

  listToday(): StoredMessage[] {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.messages.filter(
      (m) => new Date(m.timestamp).getTime() >= start.getTime(),
    );
  }

  listAll(
    limit = 50,
    filter?: { channel?: string; contact?: string },
  ): StoredMessage[] {
    let list = this.messages;
    if (filter?.channel) {
      list = list.filter((m) => m.channel === filter.channel);
    }
    if (filter?.contact) {
      list = list.filter(
        (m) => m.from === filter.contact || m.to === filter.contact,
      );
    }
    return collapseBubbles(list).slice(0, limit);
  }

  upsertChats(list: Conversation[]): number {
    let changed = 0;
    for (const chat of list) {
      const existing = this.chats.get(chat.id);
      if (!existing) {
        this.chats.set(chat.id, { ...chat });
        changed += 1;
        continue;
      }
      const next = { ...existing };
      if (chat.name) next.name = chat.name;
      if (chat.lastTimestamp >= existing.lastTimestamp) {
        next.lastMessage = chat.lastMessage || existing.lastMessage;
        next.lastTimestamp = chat.lastTimestamp;
        next.lastDirection = chat.lastDirection;
        next.unreadCount = chat.unreadCount;
      }
      this.chats.set(chat.id, next);
      changed += 1;
    }
    if (changed === 0) return 0;
    void this.persistChats();
    this.emit('sync', { chats: changed });
    return changed;
  }

  setContactName(
    channel: string,
    contact: string,
    name?: string,
    kind: 'saved' | 'profile' = 'profile',
  ) {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.includes('@')) return;
    const id = `${channel}:${contact}`;
    const current = this.names.get(id);
    const saved = kind === 'saved';
    if (current) {
      if (current.saved && !saved) return;
      if (current.name === trimmed && current.saved === saved) return;
    }
    this.names.set(id, { name: trimmed, saved });
    const existing = this.chats.get(id);
    if (existing && existing.name !== trimmed) {
      existing.name = trimmed;
      this.chats.set(id, existing);
      void this.persistChats();
    }
    this.scheduleNamesPersist();
  }

  hasName(channel: string, contact: string) {
    return Boolean(this.displayName(`${channel}:${contact}`));
  }

  namedCount() {
    return this.names.size;
  }

  mediaPlaceholders(contact: string): StoredMessage[] {
    return this.messages.filter((m) => {
      if (m.channel !== 'whatsapp') return false;
      if (m.from !== contact && m.to !== contact) return false;
      if (m.attachments?.length) return false;
      return isMediaPlaceholder(m.body);
    });
  }

  whatsappContacts() {
    const ids = new Set<string>();
    for (const chat of this.listConversations()) {
      if (chat.channel === 'whatsapp') ids.add(chat.contact);
    }
    return [...ids];
  }

  linkWhatsAppIds(a?: string, b?: string) {
    if (!a || !b || a === b) return;
    const left = this.names.get(`whatsapp:${a}`);
    const right = this.names.get(`whatsapp:${b}`);
    const best = [left, right]
      .filter(Boolean)
      .sort((x, y) => Number(y!.saved) - Number(x!.saved))[0];
    if (!best) return;
    this.setContactName('whatsapp', a, best.name, best.saved ? 'saved' : 'profile');
    this.setContactName('whatsapp', b, best.name, best.saved ? 'saved' : 'profile');
  }

  private dropPlaceholderWhatsAppChats() {
    let dropped = 0;
    for (const [id, chat] of [...this.chats.entries()]) {
      if (chat.channel !== 'whatsapp') continue;
      const placeholder =
        !chat.lastMessage || chat.lastMessage === 'WhatsApp chat';
      if (!placeholder) continue;
      this.chats.delete(id);
      dropped += 1;
    }
    if (dropped) void this.persistChats();
  }

  listConversations(): Conversation[] {
    const map = new Map<string, Conversation>();
    for (const chat of this.chats.values()) {
      map.set(chat.id, {
        ...chat,
        name: chat.name || this.displayName(chat.id),
      });
    }
    const counted = new Set<string>();
    for (const m of this.messages) {
      const contact = m.direction === 'in' ? m.from : m.to;
      const id = `${m.channel}:${contact}`;
      const preview = m.body?.trim()
        ? m.body
        : m.attachments?.length
          ? attachmentLabel(m.attachments[0])
          : '';
      const existing = map.get(id);
      if (!existing) {
        counted.add(id);
        map.set(id, {
          id,
          channel: m.channel as MessageChannel,
          contact,
          name: this.displayName(id),
          lastMessage: preview,
          lastTimestamp: m.timestamp,
          lastDirection: m.direction,
          unreadCount: m.direction === 'in' && !m.read ? 1 : 0,
        });
      } else {
        if (!existing.name) existing.name = this.displayName(id);
        if (!counted.has(id)) {
          counted.add(id);
          existing.unreadCount = 0;
        }
        if (m.direction === 'in' && !m.read) existing.unreadCount += 1;
        if (m.timestamp >= existing.lastTimestamp) {
          existing.lastMessage = preview || existing.lastMessage;
          existing.lastTimestamp = m.timestamp;
          existing.lastDirection = m.direction;
        }
      }
    }
    return [...map.values()].sort((a, b) =>
      b.lastTimestamp.localeCompare(a.lastTimestamp),
    );
  }

  markRead(channel: string, contact: string) {
    let changed = false;
    for (const m of this.messages) {
      if (m.channel !== channel) continue;
      if (m.from !== contact && m.to !== contact) continue;
      if (!m.read) {
        m.read = true;
        changed = true;
      }
    }
    if (changed) void this.persist();
    this.emit('read', { channel, contact });
  }

  findConversationByName(query: string): Conversation | undefined {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    const chats = this.listConversations();
    return (
      chats.find((c) => c.name?.toLowerCase() === q) ??
      chats.find((c) => c.name?.toLowerCase().includes(q)) ??
      chats.find((c) => c.contact.replace(/@.*/, '').includes(q)) ??
      chats.find((c) => c.contact.toLowerCase().includes(q))
    );
  }

  getLastMessage(channel: string, contact: string): StoredMessage | undefined {
    const thread = this.listAll(200, { channel, contact });
    return thread[0];
  }

  deleteMessage(channel: string, contact: string, messageId: string): boolean {
    const idx = this.messages.findIndex(
      (m) =>
        m.channel === channel &&
        m.id === messageId &&
        (m.from === contact || m.to === contact),
    );
    if (idx < 0) return false;
    this.messages.splice(idx, 1);
    void this.persist();
    this.emit('delete', { channel, contact, messageId });
    return true;
  }

  deleteConversation(channel: string, contact: string): number {
    const before = this.messages.length;
    this.messages = this.messages.filter(
      (m) =>
        m.channel !== channel || (m.from !== contact && m.to !== contact),
    );
    const removed = before - this.messages.length;
    const id = `${channel}:${contact}`;
    if (this.chats.has(id)) {
      this.chats.delete(id);
      void this.persistChats();
    }
    if (removed > 0) void this.persist();
    this.emit('delete', { channel, contact, conversation: true });
    return removed;
  }

  threadText(channel: string, contact: string, limit = 50): string {
    return this.listAll(limit, { channel, contact })
      .reverse()
      .map((m) => {
        const who = m.direction === 'out' ? 'me' : m.from;
        const body = m.body?.trim() || (m.attachments?.length ? '[attachment]' : '');
        return `${who}: ${body}`;
      })
      .join('\n');
  }

  uploadsDir(): string {
    const dataDir =
      this.config.get<string>('DATA_DIR') ?? join(process.cwd(), '..', '..', 'data');
    return join(dataDir, 'uploads');
  }

  async ensureUploadsDir() {
    await mkdir(this.uploadsDir(), { recursive: true });
  }

  private async persist() {
    if (this.writing) return;
    this.writing = true;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(this.messages, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn(
        `Could not persist messages: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.writing = false;
    }
  }

  private displayName(id: string) {
    const exact = this.names.get(id)?.name;
    if (exact) return exact;
    const sep = id.indexOf(':');
    if (sep < 0) return undefined;
    const channel = id.slice(0, sep);
    const contact = id.slice(sep + 1);
    const normalized = contact.replace(/:\d+@/, '@');
    if (normalized === contact) return undefined;
    return this.names.get(`${channel}:${normalized}`)?.name;
  }

  private scheduleNamesPersist() {
    if (this.namesTimer) return;
    this.namesTimer = setTimeout(() => {
      this.namesTimer = null;
      void this.persistNames();
      this.emit('sync', { names: this.names.size });
    }, 400);
  }

  private async persistNames() {
    try {
      await mkdir(dirname(this.namesFile), { recursive: true });
      await writeFile(
        this.namesFile,
        JSON.stringify(Object.fromEntries(this.names), null, 2),
        'utf8',
      );
    } catch (err) {
      this.logger.warn(
        `Could not persist contact names: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async persistChats() {
    try {
      await mkdir(dirname(this.chatsFile), { recursive: true });
      await writeFile(
        this.chatsFile,
        JSON.stringify([...this.chats.values()], null, 2),
        'utf8',
      );
    } catch (err) {
      this.logger.warn(
        `Could not persist chats: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

export function attachmentKind(mime: string): MessageAttachment['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export function newAttachment(file: {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}): MessageAttachment {
  return {
    id: randomUUID(),
    kind: attachmentKind(file.mimetype),
    name: file.originalname || file.filename,
    mime: file.mimetype,
    url: `/uploads/${file.filename}`,
    size: file.size,
  };
}

function isMediaPlaceholder(body?: string) {
  return (
    body === '[photo]' ||
    body === '[voice message]' ||
    body === '[attachment]' ||
    body === '[sticker]'
  );
}

function attachmentLabel(att: MessageAttachment): string {
  if (att.kind === 'image') return 'Photo';
  if (att.kind === 'audio') return 'Voice message';
  return att.name || 'File';
}

function isSameBubble(a: StoredMessage, b: StoredMessage) {
  if (a.channel !== b.channel) return false;
  if (a.direction !== b.direction) return false;
  if (a.from !== b.from || a.to !== b.to) return false;
  if (a.attachments?.length || b.attachments?.length) return false;
  if (!(a.body ?? '') || !(b.body ?? '')) return false;
  if ((a.body ?? '') !== (b.body ?? '')) return false;
  return (
    Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) <
    10_000
  );
}

function collapseBubbles(list: StoredMessage[]): StoredMessage[] {
  const out: StoredMessage[] = [];
  for (const m of list) {
    if (out.some((x) => isSameBubble(x, m))) continue;
    out.push(m);
  }
  return out;
}
