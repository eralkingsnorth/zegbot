import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
  forwardRef,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import type { MessageChannel } from '@zegbot/shared';
import { MessagesService, newAttachment } from './messages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsapp: WhatsappService,
  ) {}

  @Get('today')
  today() {
    return this.messages.listToday();
  }

  @Get('conversations')
  conversations() {
    return this.messages.listConversations();
  }

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('channel') channel?: string,
    @Query('contact') contact?: string,
  ) {
    if (contact && (channel ?? 'whatsapp') === 'whatsapp') {
      this.whatsapp.fillChatMedia(contact);
    }
    return this.messages.listAll(limit ? Number(limit) : 80, {
      channel,
      contact,
    });
  }

  @Post('read')
  read(@Body() body: { channel: string; contact: string }) {
    if (!body?.channel || !body?.contact) {
      throw new BadRequestException('channel and contact are required');
    }
    this.messages.markRead(body.channel, body.contact);
    return { ok: true };
  }

  @Post('send')
  @UseInterceptors(FilesInterceptor('files', 5))
  async send(
    @UploadedFiles() files: UploadedFile[] = [],
    @Body() body: { channel?: string; to?: string; body?: string },
  ) {
    const channel = (body.channel ?? 'whatsapp') as MessageChannel;
    const to = (body.to ?? '').trim();
    const text = (body.body ?? '').trim();
    if (!to) throw new BadRequestException('to is required');
    if (!text && (!files || files.length === 0)) {
      throw new BadRequestException('Message or attachment is required');
    }

    const attachments = (files ?? []).map(newAttachment);

    if (channel === 'whatsapp') {
      await this.whatsapp.sendMessage(to, text, attachments);
      return { ok: true };
    }

    this.messages.add({
      id: randomUUID(),
      channel,
      from: 'me',
      to,
      body: text,
      timestamp: new Date().toISOString(),
      direction: 'out',
      read: true,
      attachments,
    });
    return { ok: true };
  }
}

type UploadedFile = {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
};
