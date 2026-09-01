import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { inflate } from 'zlib';
import { promisify } from 'util';
import makeWASocket, {
  ALL_WA_PATCH_NAMES,
  Browsers,
  DisconnectReason,
  downloadAndProcessHistorySyncNotification,
  downloadMediaMessage,
  extractMessageContent,
  fetchLatestWaWebVersion,
  getHistoryMsg,
  getBinaryNodeChild,
  getBinaryNodeChildren,
  jidNormalizedUser,
  processHistoryMessage,
  proto,
  S_WHATSAPP_NET,
  USyncQuery,
  USyncUser,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { join, basename } from 'path';
import { rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { MessagesService, newAttachment } from '../messages/messages.service';
import type {
  Conversation,
  MessageAttachment,
  StoredMessage,
  WhatsAppState,
} from '@zegbot/shared';
import { EventEmitter } from 'events';
import {
  HumanConfig,
  randomBetween,
  readHumanConfig,
  reconnectDelayMs,
  sleep,
  typingDurationMs,
} from './human';
import { SendLimits } from './send-limits';
import { SendBlockedError, SendQueue } from './send-queue';
import { DuplicateTracker, expandSpintax } from './variation';
import { JsonStore } from '../common/json-store';

const inflateAsync = promisify(inflate);

type IncomingKey = { id?: string; remoteJid?: string | null; fromMe?: boolean };

const MAX_RECONNECT_ATTEMPTS = 6;

type HistoryMessage = {
  key?: IncomingKey;
  message?: Record<string, unknown> | null;
  messageTimestamp?: number | string | { toNumber?: () => number };
  pushName?: string;
};

@Injectable()
export class WhatsappService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappService.name);
  private socket: WASocket | null = null;
  private state: WhatsAppState = { status: 'disconnected' };
  private connecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly human: HumanConfig;
  /** Latest unread inbound key per chat, so replies can send a read receipt first. */
  private readonly lastIncoming = new Map<string, IncomingKey>();
  private readonly pendingMedia = new Map<string, HistoryMessage>();
  private mediaBusy = 0;
  private readonly mediaWait: HistoryMessage[] = [];
  private readonly limits: SendLimits;
  private readonly queue: SendQueue;
  private readonly duplicates = new DuplicateTracker();

  constructor(
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
  ) {
    super();
    this.human = readHumanConfig(this.config);

    const dataDir =
      this.config.get<string>('DATA_DIR') ?? join(process.cwd(), '..', '..', 'data');
    this.limits = new SendLimits(
      new JsonStore(join(dataDir, 'whatsapp-limits.json')),
      this.human,
    );
    this.queue = new SendQueue(this.human, this.limits);
  }

  /** Today's usage against the current (possibly warm-up reduced) caps. */
  usage() {
    return this.limits.snapshot();
  }

  onModuleInit() {
    // Only resume an existing link. Auto-connecting without credentials makes every
    // dev restart a fresh registration attempt, which WhatsApp rate-limits.
    if (existsSync(join(this.sessionDir(), 'creds.json'))) {
      void this.connect();
    } else {
      this.logger.log('No WhatsApp session yet — waiting for a connect request.');
    }
  }

  onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.end(undefined);
  }

  getState(): WhatsAppState {
    return this.state;
  }

  async connect() {
    if (
      this.socket &&
      (this.state.status === 'connecting' ||
        this.state.status === 'connected' ||
        this.state.status === 'qr' ||
        this.state.status === 'pairing')
    ) {
      if (this.state.status === 'connected') {
        void this.pullAddressBook().catch((err) =>
          this.logger.warn(
            `Address book sync failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
      }
      return this.state;
    }
    if (this.connecting) return this.state;

    this.connecting = true;
    this.setState({ status: 'connecting', error: undefined });

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir());
      const version = await this.latestVersion();

      this.socket = makeWASocket({
        auth: state,
        version,
        // Present as a real WhatsApp Desktop client instead of the default library name.
        browser: Browsers.ubuntu(this.config.get('WHATSAPP_DEVICE_NAME', 'Chrome')),
        // Staying permanently online is a bot tell, and it also steals phone notifications.
        markOnlineOnConnect: false,
        // Pull existing chats from the phone so the inbox is not empty after linking.
        syncFullHistory: this.config.get('WHATSAPP_SYNC_HISTORY', 'true') !== 'false',
        shouldSyncHistoryMessage: () => true,
        generateHighQualityLinkPreview: true,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: randomBetween(25_000, 35_000),
        retryRequestDelayMs: randomBetween(500, 1500),
      });

      this.socket.ev.on('creds.update', saveCreds);

      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          const dataUrl = await QRCode.toDataURL(qr);
          this.setState({
            status: this.state.pairingCode ? 'pairing' : 'qr',
            qr: dataUrl,
            error: undefined,
          });
        }

        if (connection === 'open') {
          this.reconnectAttempts = 0;
          const phone = this.socket?.user?.id?.split(':')[0];
          this.setState({
            status: 'connected',
            phone,
            qr: undefined,
            pairingCode: undefined,
            pairingPhone: undefined,
            error: undefined,
          });
          this.logger.log(`WhatsApp connected: ${phone ?? 'unknown'}`);
          setTimeout(() => {
            void this.pullAddressBook().catch((err) =>
              this.logger.warn(
                `Address book sync failed: ${err instanceof Error ? err.message : err}`,
              ),
            );
          }, 2500);
        }

        if (connection === 'close') {
          const code = (
            lastDisconnect?.error as { output?: { statusCode?: number } }
          )?.output?.statusCode;
          const fatal =
            code === DisconnectReason.loggedOut ||
            code === DisconnectReason.forbidden ||
            code === DisconnectReason.badSession;
          const restart = code === DisconnectReason.restartRequired;
          const wasRegistered = Boolean(this.socket?.authState?.creds?.registered);
          const paired = Boolean(this.socket?.authState?.creds?.me);
          const hadQr =
            this.state.status === 'qr' ||
            this.state.status === 'pairing' ||
            Boolean(this.state.qr);
          this.socket = null;
          this.lastIncoming.clear();

          if (fatal) {
            this.setState({
              status: 'disconnected',
              qr: undefined,
              phone: undefined,
              pairingCode: undefined,
              pairingPhone: undefined,
              error: 'WhatsApp logged out this device. Connect again.',
            });
            this.logger.warn(`WhatsApp session ended (code ${code ?? 'unknown'})`);
            void rm(this.sessionDir(), { recursive: true, force: true });
            return;
          }

          // After a successful QR scan WhatsApp sends 515 "restart required".
          // The session is already saved — reconnect, do not wipe it.
          if (restart || wasRegistered || paired) {
            this.setState({
              status: 'connecting',
              qr: undefined,
              error: undefined,
            });
            if (restart) this.reconnectAttempts = 0;
            else {
              this.reconnectAttempts += 1;
              if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
                this.setState({
                  status: 'disconnected',
                  error: 'WhatsApp kept dropping. Click Show QR code to try again.',
                });
                this.logger.warn('WhatsApp refused several reconnects in a row.');
                return;
              }
            }
            const delay = restart
              ? 1200
              : reconnectDelayMs(this.reconnectAttempts);
            this.logger.log(
              restart
                ? 'WhatsApp pairing saved, reconnecting…'
                : `WhatsApp disconnected, reconnecting in ${Math.round(delay / 1000)}s`,
            );
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => void this.connect(), delay);
            return;
          }

          this.setState({
            status: 'disconnected',
            qr: undefined,
            phone: undefined,
            pairingCode: undefined,
            pairingPhone: undefined,
            error: hadQr
              ? 'QR expired before the scan finished. Click Show QR code again.'
              : 'WhatsApp closed before a QR appeared. Try Connect again.',
          });
          this.logger.warn('WhatsApp did not finish linking.');
          void rm(this.sessionDir(), { recursive: true, force: true });
        }
      });

      this.socket.ev.on('messages.upsert', ({ messages, type }) => {
        void this.ingestHistoryPackets(messages ?? []);
        if (type === 'notify') {
          void this.ingestIncoming(messages);
        } else {
          this.importHistory(messages ?? []);
        }
      });

      this.socket.ev.on('chats.upsert', (chats) => {
        this.importChats(chats ?? []);
      });

      this.socket.ev.on('chats.update', (chats) => {
        this.importChats(chats ?? []);
      });

      this.socket.ev.on('contacts.upsert', (contacts) => {
        this.importContacts(contacts ?? []);
      });

      this.socket.ev.on('contacts.update', (contacts) => {
        this.importContacts(contacts ?? []);
      });

      this.socket.ev.on('chats.phoneNumberShare', ({ lid, jid }) => {
        this.messages.linkWhatsAppIds(lid, jid);
      });

      this.socket.ev.on('groups.upsert', (groups) => {
        this.importGroupNames(groups ?? []);
      });

      this.socket.ev.on('groups.update', (groups) => {
        this.importGroupNames(groups ?? []);
      });

      this.socket.ev.on('messaging-history.set', ({ messages, chats, contacts, progress }) => {
        this.importContacts(contacts ?? []);
        this.importChats(chats ?? []);
        this.importHistory(messages ?? [], progress ?? undefined);
      });
    } finally {
      this.connecting = false;
    }

    await this.waitUntilReady(20_000);
    return this.state;
  }

  private waitUntilReady(ms: number) {
    if (
      this.state.status === 'qr' ||
      this.state.status === 'pairing' ||
      this.state.status === 'connected' ||
      this.state.status === 'disconnected'
    ) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.off('state', onState);
        resolve();
      }, ms);
      const onState = (state: WhatsAppState) => {
        if (state.status === 'connecting') return;
        clearTimeout(timer);
        this.off('state', onState);
        resolve();
      };
      this.on('state', onState);
    });
  }

  private sessionDir() {
    return join(
      process.cwd(),
      this.config.get('WHATSAPP_SESSION_DIR', '../../sessions'),
    );
  }

  /**
   * Unlink the device and wipe credentials. Needed to pull chat history, which
   * WhatsApp only sends once, right after a device is linked.
   */
  async logout(): Promise<WhatsAppState> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    try {
      await this.socket?.logout();
    } catch {
      // The session may already be invalid; the local wipe below is what matters.
    }
    this.socket?.end(undefined);
    this.socket = null;
    this.lastIncoming.clear();
    this.reconnectAttempts = 0;

    await rm(this.sessionDir(), { recursive: true, force: true });
    this.setState({
      status: 'disconnected',
      qr: undefined,
      phone: undefined,
      pairingCode: undefined,
      pairingPhone: undefined,
    });
    return this.state;
  }

  async requestPairingCode(phone: string): Promise<WhatsAppState> {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) {
      throw new BadRequestException(
        'Enter your WhatsApp number with country code, digits only',
      );
    }

    if (this.state.status === 'connected') {
      return this.state;
    }

    await this.connect();

    const sock = this.socket;
    if (!sock) {
      throw new BadRequestException('WhatsApp is starting. Try again in a moment.');
    }

    if (sock.authState.creds.registered) {
      return this.state;
    }

    try {
      await Promise.race([
        sock.waitForSocketOpen(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 8000),
        ),
      ]).catch(() => undefined);

      const code = await sock.requestPairingCode(digits);
      const formatted = code.includes('-')
        ? code
        : `${code.slice(0, 4)}-${code.slice(4)}`;
      this.setState({
        status: 'pairing',
        pairingCode: formatted,
        pairingPhone: digits,
      });
      return this.state;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not get pairing code';
      this.logger.warn(`Pairing code failed: ${msg}`);
      throw new BadRequestException(
        'Could not get a pairing code. Use setup on another device instead.',
      );
    }
  }

  async sendMessage(to: string, text: string, attachments: MessageAttachment[] = []) {
    const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
    const body = expandSpintax(text);

    let id = `${Date.now()}`;
    if (this.socket && this.state.status === 'connected') {
      this.warnOnDuplicate(body, jid);
      try {
        const sent = await this.queue.enqueue(jid, () =>
          this.pushToWhatsApp(jid, body, attachments),
        );
        if (sent?.key?.id) id = String(sent.key.id);
      } catch (err) {
        if (err instanceof SendBlockedError) {
          this.logger.warn(`WhatsApp send blocked: ${err.message}`);
          throw new BadRequestException(err.message);
        }
        this.logger.warn(
          `WhatsApp send failed, saved in inbox: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.messages.add({
      id,
      channel: 'whatsapp',
      from: 'me',
      to: jid,
      body,
      timestamp: new Date().toISOString(),
      direction: 'out',
      read: true,
      attachments,
    });
  }

  async deleteMessage(contact: string, messageId: string, fromMe = true) {
    const jid = contact.includes('@') ? contact : `${contact.replace(/\D/g, '')}@s.whatsapp.net`;
    const sock = this.socket;
    if (!sock || this.state.status !== 'connected') {
      throw new BadRequestException('WhatsApp is not connected');
    }
    await sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe,
        id: messageId,
      },
    });
    this.messages.deleteMessage('whatsapp', jid, messageId);
  }

  async deleteChat(contact: string) {
    const jid = contact.includes('@') ? contact : `${contact.replace(/\D/g, '')}@s.whatsapp.net`;
    const sock = this.socket;
    if (!sock || this.state.status !== 'connected') {
      throw new BadRequestException('WhatsApp is not connected');
    }
    const last = this.messages.getLastMessage('whatsapp', jid);
    if (last) {
      try {
        await sock.chatModify(
          {
            delete: true,
            lastMessages: [
              {
                key: {
                  remoteJid: jid,
                  fromMe: last.direction === 'out',
                  id: last.id,
                },
                messageTimestamp: Math.floor(new Date(last.timestamp).getTime() / 1000),
              },
            ],
          },
          jid,
        );
      } catch (err) {
        this.logger.warn(
          `WhatsApp chat delete failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    this.messages.deleteConversation('whatsapp', jid);
  }

  private warnOnDuplicate(text: string, jid: string) {
    const threshold = this.human.duplicateWarnThreshold;
    if (threshold <= 0) return;

    const count = this.duplicates.track(text, jid);
    if (count === threshold) {
      this.logger.warn(
        `The same message text has now gone to ${count} different contacts in the last hour. ` +
          'Identical broadcasts get reported as spam — use {hi|hello|hey} style variations.',
      );
    }
  }

  private async pushToWhatsApp(
    jid: string,
    text: string,
    attachments: MessageAttachment[],
  ) {
    const sock = this.socket;
    if (!sock) return undefined;

    await this.openChat(jid);
    let sent: { key?: { id?: string | null } } | undefined;

    if (attachments.length === 0) {
      await this.showTyping(jid, text, 'composing');
      sent = await sock.sendMessage(jid, { text });
      await this.stopTyping(jid);
      return sent;
    }

    let captionUsed = false;
    let first = true;
    for (const att of attachments) {
      if (!first) {
        await sleep(
          this.human.enabled
            ? randomBetween(this.human.attachmentGapMinMs, this.human.attachmentGapMaxMs)
            : 0,
        );
      }
      first = false;

      const buf = await this.readUpload(att.url);
      if (att.kind === 'image') {
        const caption = !captionUsed ? text || undefined : undefined;
        await this.showTyping(jid, caption ?? '', 'composing');
        sent = await sock.sendMessage(jid, {
          image: buf,
          caption,
          mimetype: att.mime,
        });
        captionUsed = true;
      } else if (att.kind === 'audio') {
        await this.showTyping(jid, '', 'recording');
        sent = await sock.sendMessage(jid, {
          audio: buf,
          mimetype: att.mime,
          ptt: true,
        });
      } else {
        sent = await sock.sendMessage(jid, {
          document: buf,
          fileName: att.name,
          mimetype: att.mime,
        });
      }
    }
    if (text && !captionUsed) {
      await this.showTyping(jid, text, 'composing');
      sent = await sock.sendMessage(jid, { text });
    }
    await this.stopTyping(jid);
    return sent;
  }

  /** Come online, read the pending message, and pause like a person opening the chat. */
  private async openChat(jid: string) {
    const sock = this.socket;
    if (!sock || !this.human.enabled) return;

    try {
      await sock.sendPresenceUpdate('available');

      const key = this.lastIncoming.get(jid);
      if (key?.id) {
        await sock.readMessages([key as never]);
        this.lastIncoming.delete(jid);
      }

      await sleep(randomBetween(this.human.readDelayMinMs, this.human.readDelayMaxMs));
    } catch (err) {
      this.logger.debug(
        `Presence/read update skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async showTyping(
    jid: string,
    text: string,
    kind: 'composing' | 'recording',
  ) {
    const sock = this.socket;
    if (!sock || !this.human.enabled) return;

    try {
      await sock.sendPresenceUpdate(kind, jid);
    } catch {
      // Presence is cosmetic; never block the actual send on it.
    }
    await sleep(typingDurationMs(text, this.human));
  }

  private async stopTyping(jid: string) {
    const sock = this.socket;
    if (!sock || !this.human.enabled) return;
    try {
      await sock.sendPresenceUpdate('paused', jid);
    } catch {
      // Ignore, see showTyping.
    }
  }

  private async latestVersion(): Promise<[number, number, number] | undefined> {
    try {
      const { version } = await fetchLatestWaWebVersion({});
      return version;
    } catch (err) {
      this.logger.warn(
        `Could not fetch latest WhatsApp version, using bundled default: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return undefined;
    }
  }

  private async readUpload(url: string) {
    const { readFile } = await import('fs/promises');
    return readFile(join(this.messages.uploadsDir(), basename(url)));
  }

  private pullAddressBook = async () => {
    const sock = this.socket;
    if (!sock) return;
    try {
      this.logger.log('Syncing WhatsApp address book…');
      await sock.resyncAppState(['critical_unblock_low', ...ALL_WA_PATCH_NAMES], true);
    } catch (err) {
      this.logger.warn(
        `Could not sync WhatsApp address book: ${err instanceof Error ? err.message : err}`,
      );
    }
    try {
      const groups = await sock.groupFetchAllParticipating();
      this.importGroupNames(Object.values(groups ?? {}));
    } catch (err) {
      this.logger.warn(
        `Could not load WhatsApp group names: ${err instanceof Error ? err.message : err}`,
      );
    }
    const missingGroups = this.messages
      .whatsappContacts()
      .filter((jid) => jid.endsWith('@g.us') && !this.messages.hasName('whatsapp', jid))
      .slice(0, 80);
    for (const jid of missingGroups) {
      try {
        const meta = await sock.groupMetadata(jid);
        this.messages.setContactName('whatsapp', jid, meta.subject, 'saved');
      } catch {
        // Some groups are no longer accessible from this device.
      }
    }
    this.logger.log(`WhatsApp names saved: ${this.messages.namedCount()}`);
    await this.pullUserNames(sock);
  }

  private async pullUserNames(sock: WASocket) {
    const unnamed = this.messages
      .whatsappContacts()
      .filter((jid) => !jid.endsWith('@g.us') && !this.messages.hasName('whatsapp', jid));
    const chunks: string[][] = [];
    for (let i = 0; i < unnamed.length && i < 80; i += 20) {
      chunks.push(unnamed.slice(i, i + 20));
    }
    for (const chunk of chunks) {
      try {
        const usync = new USyncQuery()
          .withContext('background')
          .withContactProtocol()
          .withLIDProtocol()
          .withStatusProtocol();
        for (const jid of chunk) {
          const user = new USyncUser().withId(jid);
          const digits = jid.replace(/@.*$/, '').replace(/:\d+$/, '');
          if (/^\d{7,}$/.test(digits) && !jid.endsWith('@lid')) {
            user.withPhone(`+${digits}`);
          }
          if (jid.endsWith('@lid')) user.withLid(jid);
          usync.withUser(user);
        }
        const result = await sock.executeUSyncQuery(usync);
        for (const row of result?.list ?? []) {
          const id = String(row.id ?? '');
          const lid = typeof row.lid === 'string' ? row.lid : undefined;
          this.messages.linkWhatsAppIds(normId(id), normId(lid));
        }
        await this.applyNamesFromUSync(sock, chunk);
      } catch (err) {
        this.logger.warn(
          `Could not query WhatsApp contact names: ${err instanceof Error ? err.message : err}`,
        );
      }
      await sleep(400);
    }
  }

  /** USync's typed parsers drop notify/name; read them from the raw IQ. */
  private async applyNamesFromUSync(sock: WASocket, jids: string[]) {
    const users = jids.map((jid) => ({
      tag: 'user',
      attrs: { jid },
      content: [{ tag: 'contact', attrs: {} }],
    }));
    const result = await sock.query({
      tag: 'iq',
      attrs: {
        to: S_WHATSAPP_NET,
        type: 'get',
        xmlns: 'usync',
      },
      content: [
        {
          tag: 'usync',
          attrs: {
            context: 'background',
            mode: 'query',
            sid: sock.generateMessageTag(),
            last: 'true',
            index: '0',
          },
          content: [
            {
              tag: 'query',
              attrs: {},
              content: [{ tag: 'contact', attrs: {} }],
            },
            { tag: 'list', attrs: {}, content: users },
          ],
        },
      ],
    });
    const usyncNode = getBinaryNodeChild(result, 'usync');
    const listNode = getBinaryNodeChild(usyncNode, 'list');
    const nodes = getBinaryNodeChildren(listNode, 'user');
    let named = 0;
    for (const node of nodes) {
      const jid = node.attrs?.jid;
      const label = (node.attrs?.notify || node.attrs?.name || '').trim();
      if (!jid || !label) continue;
      this.messages.setContactName('whatsapp', jid, label, 'profile');
      named += 1;
    }
    if (named > 0) {
      this.logger.log(`Loaded ${named} WhatsApp profile names`);
    }
  }

  /** WhatsApp now sends the first chat dump as a compressed blob, not a media file. */
  private async ingestHistoryPackets(messages: unknown[]) {
    for (const raw of messages as Array<{ message?: unknown }>) {
      const hist = getHistoryMsg(raw.message as never);
      if (!hist) continue;
      try {
        const data = await this.decodeHistorySync(hist);
        if (!data) continue;
        this.importContacts(data.contacts ?? []);
        this.importChats(data.chats ?? []);
        this.importHistory(data.messages ?? [], data.progress ?? undefined);
      } catch (err) {
        this.logger.warn(
          `WhatsApp history chunk failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private async decodeHistorySync(hist: proto.Message.IHistorySyncNotification) {
    const inline = hist.initialHistBootstrapInlinePayload;
    if (inline && inline.length) {
      const raw = Buffer.from(inline);
      let inflated: Buffer;
      try {
        inflated = await inflateAsync(raw);
      } catch {
        inflated = await inflateAsync(raw, { finishFlush: 2 } as never);
      }
      const parsed = processHistoryMessage(proto.HistorySync.decode(inflated));
      this.logger.log(
        `Decoded inline history: ${parsed.chats?.length ?? 0} chats, ${parsed.messages?.length ?? 0} messages`,
      );
      return parsed;
    }
    if (hist.directPath || hist.fileSha256) {
      const parsed = await downloadAndProcessHistorySyncNotification(hist, {});
      this.logger.log(
        `Downloaded history: ${parsed.chats?.length ?? 0} chats, ${parsed.messages?.length ?? 0} messages`,
      );
      return parsed;
    }
    return null;
  }

  private importContacts(
    contacts: Array<{
      id?: string;
      lid?: string;
      jid?: string;
      name?: string;
      notify?: string;
      verifiedName?: string;
      firstName?: string;
    }>,
  ) {
    for (const c of contacts) {
      const label = (c.name || c.notify || c.verifiedName || c.firstName || '').trim();
      if (!label) continue;
      const kind = c.name ? 'saved' : 'profile';
      const ids = [c.id, c.lid, c.jid].filter(Boolean) as string[];
      for (const rawId of ids) {
        const jid = jidNormalizedUser(rawId) || rawId;
        if (!jid || skipJid(jid)) continue;
        this.messages.setContactName('whatsapp', jid, label, kind);
        if (jid !== rawId) {
          this.messages.setContactName('whatsapp', rawId, label, kind);
        }
      }
      this.messages.linkWhatsAppIds(normId(c.id), normId(c.lid));
      this.messages.linkWhatsAppIds(normId(c.id), normId(c.jid));
      this.messages.linkWhatsAppIds(normId(c.lid), normId(c.jid));
    }
    const named = contacts.filter(
      (c) => c.name || c.notify || c.verifiedName || c.firstName,
    ).length;
    if (named > 0) {
      this.logger.log(`Applied ${named} WhatsApp contact names`);
    }
  }

  private importGroupNames(
    groups: Array<{ id?: string; subject?: string; name?: string }>,
  ) {
    for (const g of groups) {
      if (!g.id) continue;
      this.messages.setContactName(
        'whatsapp',
        g.id,
        g.subject || g.name,
        'saved',
      );
    }
  }

  /**
   * Chat list from WhatsApp (names + last activity). This is what fills the inbox
   * even when full message history is not sent again.
   */
  private importChats(chats: unknown[]) {
    const rows: Conversation[] = [];
    for (const raw of chats as WaChat[]) {
      const jid = raw?.id;
      if (!jid || skipJid(jid)) continue;
      const ts = toIso(raw.conversationTimestamp ?? raw.lastMessageRecvTimestamp);
      const preview = chatPreview(raw);
      const isGroup = jid.endsWith('@g.us');
      if (raw.name || raw.notify) {
        this.messages.setContactName(
          'whatsapp',
          jid,
          raw.name || raw.notify,
          raw.name ? 'saved' : 'profile',
        );
      }
      this.messages.linkWhatsAppIds(normId(jid), normId(raw.newJid));
      this.messages.linkWhatsAppIds(normId(jid), normId(raw.oldJid));
      this.messages.linkWhatsAppIds(normId(raw.newJid), normId(raw.oldJid));
      if (!preview && !isGroup) continue;
      rows.push({
        id: `whatsapp:${jid}`,
        channel: 'whatsapp',
        contact: jid,
        name: raw.name || raw.notify || undefined,
        lastMessage: preview || (isGroup ? raw.name || 'Group' : ''),
        lastTimestamp: ts,
        lastDirection: 'in',
        unreadCount: Math.max(0, Number(raw.unreadCount) || 0),
      });
    }
    if (rows.length === 0) return;
    const added = this.messages.upsertChats(rows);
    if (added > 0) {
      this.logger.log(`Imported ${added} WhatsApp chats`);
    }
  }

  /**
   * Chats already on the phone arrive in bulk after linking. Media is left as a
   * label here — downloading a whole history would hammer the connection.
   */
  private importHistory(messages: unknown[], progress?: number) {
    const rows: StoredMessage[] = [];

    for (const msg of messages as HistoryMessage[]) {
      if (!msg?.key?.remoteJid) continue;
      const jid = msg.key.remoteJid;
      if (skipJid(jid)) continue;

      const content = unwrapContent(msg.message);
      const outgoing = Boolean(msg.key.fromMe);
      const media = content ? this.incomingMedia(content) : null;
      const body =
        textFromContent(content) ||
        (media ? mediaPlaceholder(media.kind, media.name) : '');
      if (!body) continue;

      if (!outgoing && msg.pushName) {
        this.messages.setContactName('whatsapp', jid, msg.pushName, 'profile');
      }

      const mediaKind = media?.kind;
      if (mediaKind === 'image' || mediaKind === 'audio') {
        this.queueWaMedia(msg);
      }

      rows.push({
        id: msg.key.id ?? `${jid}-${String(msg.messageTimestamp ?? Date.now())}`,
        channel: 'whatsapp',
        from: outgoing ? 'me' : jid,
        to: outgoing ? jid : 'me',
        body,
        timestamp: toIso(msg.messageTimestamp),
        direction: outgoing ? 'out' : 'in',
        read: true,
        attachments: [],
      });
    }

    this.logger.log(
      `History batch: ${messages.length} raw, ${rows.length} usable${
        progress != null ? ` (${progress}%)` : ''
      }`,
    );
    if (rows.length === 0) return;
    const added = this.messages.addMany(rows);
    if (added > 0) {
      this.logger.log(`Imported ${added} WhatsApp messages from history`);
    }
  }

  private async ingestIncoming(messages: unknown[]) {
    for (const msg of messages as Array<{
      key: { fromMe?: boolean; id?: string; remoteJid?: string | null };
      message?: Record<string, unknown> | null;
      messageTimestamp?: number | string;
      pushName?: string;
    }>) {
      const jid = msg.key.remoteJid ?? 'unknown';
      if (skipJid(jid)) continue;
      const content = unwrapContent(msg.message);
      if (!content) continue;
      if (!msg.key.fromMe && msg.pushName) {
        this.messages.setContactName('whatsapp', jid, msg.pushName, 'profile');
      }

      // Messages you send from your phone arrive here too, so the thread stays complete.
      if (msg.key.fromMe) {
        const media = this.incomingMedia(content);
        const attachments = media ? await this.saveWaMedia(msg) : [];
        const text =
          textFromContent(content) ||
          (attachments.length ? '' : media ? mediaPlaceholder(media.kind, media.name) : '');
        if (!text && attachments.length === 0) continue;
        this.messages.add({
          id: msg.key.id ?? `${Date.now()}`,
          channel: 'whatsapp',
          from: 'me',
          to: jid,
          body: text,
          timestamp: toIso(msg.messageTimestamp),
          direction: 'out',
          read: true,
          attachments,
        });
        continue;
      }

      const from = jid;
      this.rememberIncoming(from, msg.key);
      const attachments: MessageAttachment[] = [];
      let body = textFromContent(content);

      try {
        const mediaType = this.incomingMedia(content);
        if (mediaType) {
          const saved = await this.saveWaMedia(msg);
          attachments.push(...saved);
          if (!body && saved.length) body = '';
        }
      } catch (err) {
        this.logger.warn(
          `Could not save incoming media: ${err instanceof Error ? err.message : err}`,
        );
        if (!body) body = '[attachment]';
      }

      this.messages.add({
        id: msg.key.id ?? `${Date.now()}`,
        channel: 'whatsapp',
        from,
        to: 'me',
        body,
        timestamp: toIso(msg.messageTimestamp),
        direction: 'in',
        read: false,
        attachments,
      });
      this.emit('message', { from, body, channel: 'whatsapp' });
    }
  }

  fillChatMedia(contact: string) {
    if (!this.socket || this.state.status !== 'connected') return;
    for (const row of this.messages.mediaPlaceholders(contact).slice(0, 20)) {
      const pending = this.pendingMedia.get(row.id);
      if (pending) this.queueWaMedia(pending, true);
    }
    void this.runMediaQueue();
  }

  private queueWaMedia(msg: HistoryMessage, force = false) {
    const id = msg.key?.id;
    if (!id || !msg.message) return;
    const ts = Date.parse(toIso(msg.messageTimestamp));
    const recent = Number.isFinite(ts) && Date.now() - ts < 21 * 24 * 60 * 60 * 1000;
    if (!force && !recent) return;
    if (!this.pendingMedia.has(id)) {
      if (this.pendingMedia.size > 200) {
        const first = this.pendingMedia.keys().next().value;
        if (first) this.pendingMedia.delete(first);
      }
      this.pendingMedia.set(id, msg);
    }
    if (this.mediaWait.length > 80 && !force) return;
    this.mediaWait.push(msg);
    void this.runMediaQueue();
  }

  private async runMediaQueue() {
    if (this.mediaBusy >= 2) return;
    const next = this.mediaWait.shift();
    if (!next) return;
    this.mediaBusy += 1;
    try {
      const attachments = await this.saveWaMedia(next);
      const id = next.key?.id;
      if (id && attachments.length) {
        this.pendingMedia.delete(id);
        this.messages.add({
          id,
          channel: 'whatsapp',
          from: next.key?.fromMe ? 'me' : (next.key?.remoteJid ?? 'unknown'),
          to: next.key?.fromMe ? (next.key?.remoteJid ?? 'unknown') : 'me',
          body: '',
          timestamp: toIso(next.messageTimestamp),
          direction: next.key?.fromMe ? 'out' : 'in',
          read: true,
          attachments,
        });
      }
    } catch (err) {
      this.logger.debug(
        `Media download skipped: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.mediaBusy -= 1;
      void this.runMediaQueue();
    }
  }

  private async saveWaMedia(msg: { key?: IncomingKey; message?: Record<string, unknown> | null }) {
    const sock = this.socket;
    const content = unwrapContent(msg.message);
    const mediaType = content ? this.incomingMedia(content) : null;
    if (!sock || !mediaType) return [];
    const buffer = (await downloadMediaMessage(
      msg as never,
      'buffer',
      {},
      {
        logger: this.logger as never,
        reuploadRequest: sock.updateMediaMessage,
      },
    )) as Buffer;
    await this.messages.ensureUploadsDir();
    const ext =
      mediaType.kind === 'image'
        ? mediaType.name.endsWith('.webp')
          ? '.webp'
          : '.jpg'
        : mediaType.kind === 'audio'
          ? '.ogg'
          : extFromName(mediaType.name);
    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    await writeFile(join(this.messages.uploadsDir(), filename), buffer);
    return [
      newAttachment({
        filename,
        originalname: mediaType.name,
        mimetype: mediaType.mime,
        size: buffer.length,
      }),
    ];
  }

  private rememberIncoming(jid: string, key: IncomingKey) {
    if (!key.id) return;
    this.lastIncoming.set(jid, key);
    if (this.lastIncoming.size > 500) {
      const oldest = this.lastIncoming.keys().next().value;
      if (oldest !== undefined) this.lastIncoming.delete(oldest);
    }
  }

  private incomingMedia(message: Record<string, unknown>): {
    kind: MessageAttachment['kind'];
    mime: string;
    name: string;
  } | null {
    const image = message.imageMessage as { mimetype?: string } | undefined;
    if (image) return { kind: 'image', mime: image.mimetype ?? 'image/jpeg', name: 'photo.jpg' };
    const audio = message.audioMessage as { mimetype?: string } | undefined;
    if (audio) return { kind: 'audio', mime: audio.mimetype ?? 'audio/ogg', name: 'voice.ogg' };
    const doc = message.documentMessage as
      | { mimetype?: string; fileName?: string }
      | undefined;
    if (doc) {
      return {
        kind: 'file',
        mime: doc.mimetype ?? 'application/octet-stream',
        name: doc.fileName ?? 'file',
      };
    }
    const sticker = message.stickerMessage as { mimetype?: string } | undefined;
    if (sticker) return { kind: 'image', mime: sticker.mimetype ?? 'image/webp', name: 'sticker.webp' };
    return null;
  }

  private setState(partial: Partial<WhatsAppState>) {
    this.state = { ...this.state, ...partial };
    this.emit('state', this.state);
  }
}

function normId(jid?: string) {
  if (!jid) return undefined;
  return jidNormalizedUser(jid) || jid;
}

function skipJid(jid: string) {
  return (
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast') ||
    jid.endsWith('@newsletter')
  );
}

function unwrapContent(
  message: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!message) return null;
  const extracted = extractMessageContent(message as never) as
    | Record<string, unknown>
    | null
    | undefined;
  return extracted ?? message;
}

function textFromContent(content: Record<string, unknown> | null): string {
  if (!content) return '';
  if (typeof content.conversation === 'string' && content.conversation.trim()) {
    return content.conversation;
  }
  const extended = content.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text) return extended.text;
  const image = content.imageMessage as { caption?: string } | undefined;
  if (image?.caption) return image.caption;
  const video = content.videoMessage as { caption?: string } | undefined;
  if (video?.caption) return video.caption;
  const doc = content.documentMessage as { caption?: string; fileName?: string } | undefined;
  if (doc?.caption) return doc.caption;
  const buttons = content.buttonsMessage as { contentText?: string } | undefined;
  if (buttons?.contentText) return buttons.contentText;
  const template = content.templateButtonReplyMessage as
    | { selectedDisplayText?: string }
    | undefined;
  if (template?.selectedDisplayText) return template.selectedDisplayText;
  return '';
}

function chatPreview(chat: WaChat): string {
  const last = chat.lastMessage?.message as Record<string, unknown> | undefined;
  const text = textFromContent(unwrapContent(last));
  if (text) return text;
  return '';
}

type WaChat = {
  id?: string;
  name?: string;
  notify?: string;
  newJid?: string;
  oldJid?: string;
  unreadCount?: number;
  conversationTimestamp?: number | string | { toNumber?: () => number };
  lastMessageRecvTimestamp?: number | string | { toNumber?: () => number };
  lastMessage?: { message?: Record<string, unknown> | null };
};

function extFromName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i) : '';
}

function mediaPlaceholder(kind: MessageAttachment['kind'], name: string): string {
  if (kind === 'image') return '[photo]';
  if (kind === 'audio') return '[voice message]';
  return `[${name || 'file'}]`;
}

/** Baileys hands back seconds, and sometimes a Long instance rather than a number. */
function toIso(value: unknown): string {
  const raw =
    typeof value === 'object' && value && 'toNumber' in value
      ? (value as { toNumber: () => number }).toNumber()
      : Number(value);
  if (!raw || Number.isNaN(raw)) return new Date().toISOString();
  const ms = raw > 1e12 ? raw : raw * 1000;
  return new Date(ms).toISOString();
}
