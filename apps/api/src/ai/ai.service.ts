import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { MessagesService } from '../messages/messages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import type { AiChatResponse } from '@zegbot/shared';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
    private readonly whatsapp: WhatsappService,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key) {
      this.openai = new OpenAI({ apiKey: key });
    }
  }

  async chat(userMessage: string): Promise<AiChatResponse> {
    const lower = userMessage.toLowerCase();
    const today = this.messages.listToday();

    if (
      lower.includes('new message') ||
      lower.includes('messages today') ||
      lower.includes('any message')
    ) {
      if (today.length === 0) {
        return { reply: 'No new messages today.' };
      }
      const summary = today
        .slice(0, 10)
        .map((m) => `- ${m.from}: ${m.body}`)
        .join('\n');
      return {
        reply: `You have ${today.length} message(s) today:\n${summary}`,
      };
    }

    const sendMatch = userMessage.match(/send\s+(.+?)\s+to\s+(.+)/i);
    if (sendMatch) {
      const [, text, to] = sendMatch;
      try {
        await this.whatsapp.sendMessage(to.trim(), text.trim());
        return {
          reply: `Message sent to ${to.trim()}.`,
          actions: [{ type: 'send_whatsapp', detail: `${to}: ${text}` }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        return { reply: `Could not send: ${msg}` };
      }
    }

    if (!this.openai) {
      return {
        reply:
          'AI is in basic mode. Ask "what are my new messages today?" or "send hello to 1234567890". Add OPENAI_API_KEY for full AI chat.',
      };
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are Zegbot, a messaging assistant. Help users check messages and send WhatsApp messages.',
          },
          {
            role: 'user',
            content: `${userMessage}\n\nRecent messages:\n${today
              .slice(0, 5)
              .map((m) => `${m.from}: ${m.body}`)
              .join('\n')}`,
          },
        ],
      });
      return { reply: completion.choices[0]?.message?.content ?? 'No reply.' };
    } catch (err) {
      this.logger.error(err);
      return { reply: 'AI request failed. Try again.' };
    }
  }
}
