import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import type { ChannelInfo } from '@zegbot/shared';
import { JsonStore } from '../common/json-store';
import { WhatsappService } from '../whatsapp/whatsapp.service';

interface MessengerState {
  connected: boolean;
  pageId?: string;
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);
  private readonly store: JsonStore<MessengerState>;

  constructor(
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
  ) {
    const dataDir =
      this.config.get<string>('DATA_DIR') ?? join(process.cwd(), '..', '..', 'data');
    this.store = new JsonStore<MessengerState>(join(dataDir, 'messenger.json'));
  }

  private metaConfigured(): boolean {
    return Boolean(this.config.get<string>('META_APP_ID'));
  }

  messengerRedirectUri(): string {
    return (
      this.config.get<string>('META_REDIRECT_URI') ??
      'http://localhost:3001/channels/messenger/callback'
    );
  }

  messengerLoginUrl(): { available: true; url: string } | { available: false; message: string } {
    const appId = this.config.get<string>('META_APP_ID');
    if (!appId) {
      return {
        available: false,
        message:
          'Messenger needs a Meta app. Add META_APP_ID and META_APP_SECRET to the API env.',
      };
    }
    const redirect = encodeURIComponent(this.messengerRedirectUri());
    const url =
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}` +
      `&redirect_uri=${redirect}` +
      `&scope=pages_show_list,pages_messaging,pages_manage_metadata`;
    return { available: true, url };
  }

  async handleMessengerCallback(code: string | undefined): Promise<boolean> {
    if (!code) return false;
    const appId = this.config.get<string>('META_APP_ID');
    const secret = this.config.get<string>('META_APP_SECRET');
    if (!appId || !secret) return false;

    try {
      const params = new URLSearchParams({
        client_id: appId,
        client_secret: secret,
        redirect_uri: this.messengerRedirectUri(),
        code,
      });
      const res = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`,
      );
      if (!res.ok) {
        this.logger.warn(`Meta token exchange failed: ${res.status}`);
        return false;
      }
      await this.store.write({ connected: true });
      return true;
    } catch (err) {
      this.logger.warn(err);
      return false;
    }
  }

  async list(): Promise<ChannelInfo[]> {
    const wa = this.whatsapp.getState();
    const messenger = (await this.store.read()) ?? { connected: false };
    const meta = this.metaConfigured();

    return [
      {
        id: 'whatsapp',
        name: 'WhatsApp',
        description: 'Pair with an 8-digit code, or set up on another device',
        available: true,
        connected: wa.status === 'connected',
        connectKind: 'live',
        detail: wa.phone,
      },
      {
        id: 'messenger',
        name: 'Messenger',
        description: 'Continue with Facebook to link a Page inbox',
        available: meta,
        connected: messenger.connected,
        connectKind: 'oauth',
        detail: meta
          ? undefined
          : 'Meta app credentials are not configured on the server yet',
      },
      {
        id: 'telegram',
        name: 'Telegram',
        description: 'Telegram inbox is not live yet',
        available: false,
        connected: false,
        connectKind: 'placeholder',
        detail: 'You can continue setup and connect this later',
      },
      {
        id: 'email',
        name: 'Email',
        description: 'Email inbox is not live yet',
        available: false,
        connected: false,
        connectKind: 'placeholder',
        detail: 'You can continue setup and connect this later',
      },
    ];
  }
}
