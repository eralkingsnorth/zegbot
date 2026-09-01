import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import OpenAI from 'openai';
import { MessagesService } from '../messages/messages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import type { AiChatResponse, AiPendingAction, Conversation } from '@zegbot/shared';

interface PendingToken {
  action: AiPendingAction;
  expiresAt: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;
  private readonly pending = new Map<string, PendingToken>();
  private readonly tokenSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
    private readonly whatsapp: WhatsappService,
  ) {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key) {
      this.openai = new OpenAI({ apiKey: key });
    }
    this.tokenSecret =
      this.config.get<string>('JWT_SECRET') ?? 'zegbot-ai-confirm-dev';
  }

  async chat(
    userMessage: string,
    opts?: { context?: string; tone?: string },
  ): Promise<AiChatResponse> {
    const lower = userMessage.toLowerCase().trim();
    const tone = opts?.tone || 'friendly';
    const context = opts?.context;

    const todayReply = this.handleTodayQuery(lower);
    if (todayReply) return todayReply;

    const sendReply = await this.handleSend(userMessage);
    if (sendReply) return sendReply;

    const summarizeReply = await this.handleSummarize(userMessage, lower);
    if (summarizeReply) return summarizeReply;

    const deleteReply = this.handleDeleteProposal(userMessage, lower);
    if (deleteReply) return deleteReply;

    if (!this.openai) {
      if (context) {
        return {
          reply:
            'AI is in basic mode. You can still send, summarize, or delete with clear commands. Add OPENAI_API_KEY for natural chat.',
        };
      }
      return {
        reply:
          'Try: "send hello to Mom", "summarize the Family group", or "delete the last message in Work". Add OPENAI_API_KEY for full AI chat.',
      };
    }

    try {
      const conversations = this.messages.listConversations().slice(0, 20);
      const convList = conversations
        .map((c) => `- ${c.name || c.contact} (${c.channel})`)
        .join('\n');
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              `You are Zegbot, a messaging operator. Help users check messages, send, summarize, or propose deletes. Keep a ${tone} tone. ` +
              `For destructive actions, tell them to use delete commands — you cannot delete directly. ` +
              (context ? `\n\nOpen chat:\n${context}` : '') +
              (convList ? `\n\nKnown conversations:\n${convList}` : ''),
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });
      return { reply: completion.choices[0]?.message?.content ?? 'No reply.' };
    } catch (err) {
      this.logger.error(err);
      return { reply: 'AI request failed. Try again.' };
    }
  }

  async transcribe(file: Express.Multer.File): Promise<{ text: string }> {
    if (!this.openai) {
      throw new BadRequestException('Voice input needs OPENAI_API_KEY on the server.');
    }
    if (!file?.size) {
      throw new BadRequestException('No audio file received.');
    }
    try {
      const { readFile } = await import('fs/promises');
      const buffer = file.buffer?.length ? file.buffer : await readFile(file.path);
      const transcription = await this.openai.audio.transcriptions.create({
        file: await OpenAI.toFile(buffer, file.originalname || 'voice.webm'),
        model: 'gpt-4o-mini-transcribe',
      });
      const text = transcription.text?.trim();
      if (!text) {
        throw new BadRequestException('Could not understand the audio. Try again.');
      }
      return { text };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(err);
      throw new BadRequestException('Transcription failed. Try again.');
    }
  }

  async confirm(token: string): Promise<AiChatResponse> {
    const entry = this.pending.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      this.pending.delete(token);
      throw new BadRequestException('This action expired. Please ask again.');
    }
    this.pending.delete(token);
    const { action } = entry;

    try {
      if (action.type === 'delete_message' && action.messageId) {
        await this.whatsapp.deleteMessage(action.contact, action.messageId);
        return {
          reply: `Deleted last message in ${action.label}.`,
          actions: [{ type: 'delete_message', detail: action.label }],
        };
      }
      if (action.type === 'delete_conversation') {
        await this.whatsapp.deleteChat(action.contact);
        return {
          reply: `Deleted the whole ${action.label} conversation.`,
          actions: [{ type: 'delete_conversation', detail: action.label }],
        };
      }
      throw new BadRequestException('Unknown action');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      return { reply: `Could not complete: ${msg}` };
    }
  }

  private handleTodayQuery(lower: string): AiChatResponse | null {
    if (
      !lower.includes('new message') &&
      !lower.includes('messages today') &&
      !lower.includes('any message')
    ) {
      return null;
    }
    const today = this.messages.listToday();
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

  private async handleSend(userMessage: string): Promise<AiChatResponse | null> {
    const sendMatch = userMessage.match(/send\s+(.+?)\s+to\s+(.+)/i);
    if (!sendMatch) return null;

    const [, text, toRaw] = sendMatch;
    const to = toRaw.trim();
    const resolved = this.resolveContact(to);
    const target = resolved?.contact ?? to;
    const label = resolved?.name || this.prettyContact(target);

    try {
      await this.whatsapp.sendMessage(target, text.trim());
      return {
        reply: `Message sent to ${label}.`,
        actions: [{ type: 'send_whatsapp', detail: `${label}: ${text.trim()}` }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      return { reply: `Could not send: ${msg}` };
    }
  }

  private async handleSummarize(
    userMessage: string,
    lower: string,
  ): Promise<AiChatResponse | null> {
    if (!lower.includes('summarize') && !lower.includes('summary') && !lower.includes('what did i miss')) {
      return null;
    }

    const target = this.extractContactFromText(userMessage);
    if (!target) {
      return {
        reply: 'Which chat should I summarize? Say something like "summarize the Family group".',
      };
    }

    const thread = this.messages.threadText(target.channel, target.contact, 80);
    if (!thread) {
      return { reply: `No messages found in ${target.label}.` };
    }

    if (!this.openai) {
      const lines = thread.split('\n').slice(-15);
      return {
        reply: `Recent messages in ${target.label}:\n${lines.join('\n')}`,
        actions: [{ type: 'summarize', detail: target.label }],
      };
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Summarize this chat thread in 3-5 short bullet points. Highlight action items and unanswered questions.',
          },
          { role: 'user', content: thread },
        ],
      });
      return {
        reply: `Summary of ${target.label}:\n\n${completion.choices[0]?.message?.content ?? 'No summary.'}`,
        actions: [{ type: 'summarize', detail: target.label }],
      };
    } catch (err) {
      this.logger.error(err);
      return { reply: 'Could not summarize. Try again.' };
    }
  }

  private handleDeleteProposal(
    userMessage: string,
    lower: string,
  ): AiChatResponse | null {
    const isDelete =
      lower.includes('delete') ||
      lower.includes('remove') ||
      lower.includes('clear chat');
    if (!isDelete) return null;

    const wholeChat =
      lower.includes('whole') ||
      lower.includes('entire') ||
      lower.includes('full conversation') ||
      lower.includes('all messages') ||
      (lower.includes('conversation') && !lower.includes('last message')) ||
      lower.includes('clear chat');

    const target = this.extractContactFromText(userMessage);
    if (!target) {
      return {
        reply: 'Which conversation? Say "delete the last message in Mom" or "delete the whole Family chat".',
      };
    }

    if (wholeChat) {
      return this.proposeAction({
        type: 'delete_conversation',
        label: target.label,
        channel: target.channel,
        contact: target.contact,
      }, `Delete the entire ${target.label} conversation? This cannot be undone.`);
    }

    const last = this.messages.getLastMessage(target.channel, target.contact);
    if (!last) {
      return { reply: `No messages found in ${target.label}.` };
    }

    return this.proposeAction(
      {
        type: 'delete_message',
        label: target.label,
        channel: target.channel,
        contact: target.contact,
        messageId: last.id,
      },
      `Delete the last message in ${target.label}? Tap Confirm to proceed.`,
    );
  }

  private proposeAction(action: AiPendingAction, reply: string): AiChatResponse {
    const token = this.createToken(action);
    return { reply, pendingAction: action, confirmToken: token };
  }

  private createToken(action: AiPendingAction): string {
    const id = randomBytes(16).toString('hex');
    const sig = createHmac('sha256', this.tokenSecret).update(id).digest('hex').slice(0, 16);
    const token = `${id}.${sig}`;
    this.pending.set(token, { action, expiresAt: Date.now() + 5 * 60_000 });
    return token;
  }

  private resolveContact(query: string): Conversation | undefined {
    return this.messages.findConversationByName(query);
  }

  private extractContactFromText(text: string): {
    channel: Conversation['channel'];
    contact: string;
    label: string;
  } | null {
    const patterns = [
      /(?:in|from|with|for)\s+(?:the\s+)?(.+?)(?:\s+chat|\s+group|\s+conversation)?$/i,
      /(?:summarize|delete|remove|clear)\s+(?:the\s+)?(.+?)(?:\s+chat|\s+group|\s+conversation)?$/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const resolved = this.resolveContact(match[1].trim());
        if (resolved) {
          return {
            channel: resolved.channel,
            contact: resolved.contact,
            label: resolved.name || this.prettyContact(resolved.contact),
          };
        }
      }
    }
    const words = text.split(/\s+/);
    for (let i = words.length - 1; i >= 0; i -= 1) {
      const chunk = words.slice(i).join(' ').replace(/[?.!]+$/, '');
      const resolved = this.resolveContact(chunk);
      if (resolved) {
        return {
          channel: resolved.channel,
          contact: resolved.contact,
          label: resolved.name || this.prettyContact(resolved.contact),
        };
      }
    }
    return null;
  }

  private prettyContact(contact: string) {
    return contact.replace(/@s\.whatsapp\.net$/, '');
  }
}
