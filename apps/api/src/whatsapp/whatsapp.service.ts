import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { join } from 'path';
import { MessagesService } from '../messages/messages.service';
import type { WhatsAppState } from '@zegbot/shared';
import { EventEmitter } from 'events';

@Injectable()
export class WhatsappService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappService.name);
  private socket: WASocket | null = null;
  private state: WhatsAppState = { status: 'disconnected' };

  constructor(
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
  ) {
    super();
  }

  onModuleInit() {
    void this.connect();
  }

  onModuleDestroy() {
    this.socket?.end(undefined);
  }

  getState(): WhatsAppState {
    return this.state;
  }

  async connect() {
    if (this.state.status === 'connecting' || this.state.status === 'connected') {
      return this.state;
    }

    this.setState({ status: 'connecting' });

    const sessionDir = join(
      process.cwd(),
      this.config.get('WHATSAPP_SESSION_DIR', '../../sessions'),
    );

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    this.socket.ev.on('creds.update', saveCreds);

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr);
        this.setState({ status: 'qr', qr: dataUrl });
      }

      if (connection === 'open') {
        const phone = this.socket?.user?.id?.split(':')[0];
        this.setState({ status: 'connected', phone, qr: undefined });
        this.logger.log(`WhatsApp connected: ${phone ?? 'unknown'}`);
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })
          ?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        this.setState({ status: 'disconnected', qr: undefined, phone: undefined });

        if (shouldReconnect) {
          this.logger.warn('WhatsApp disconnected, reconnecting...');
          setTimeout(() => void this.connect(), 3000);
        } else {
          this.logger.warn('WhatsApp logged out');
        }
      }
    });

    this.socket.ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const body =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          '[media]';
        const from = msg.key.remoteJid ?? 'unknown';
        this.messages.add({
          id: msg.key.id ?? `${Date.now()}`,
          channel: 'whatsapp',
          from,
          to: 'me',
          body,
          timestamp: new Date(Number(msg.messageTimestamp) * 1000).toISOString(),
          direction: 'in',
        });
        this.emit('message', { from, body });
      }
    });

    return this.state;
  }

  async sendMessage(to: string, text: string) {
    if (!this.socket || this.state.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    const jid = to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
    await this.socket.sendMessage(jid, { text });

    this.messages.add({
      id: `${Date.now()}`,
      channel: 'whatsapp',
      from: 'me',
      to: jid,
      body: text,
      timestamp: new Date().toISOString(),
      direction: 'out',
    });
  }

  private setState(partial: Partial<WhatsAppState>) {
    this.state = { ...this.state, ...partial };
    this.emit('state', this.state);
  }
}
