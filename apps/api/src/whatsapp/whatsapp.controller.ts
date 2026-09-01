import { Controller, Get, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get('status')
  status() {
    return this.whatsapp.getState();
  }

  @Post('connect')
  connect() {
    return this.whatsapp.connect();
  }

  @Post('send')
  send(@Body() body: { to: string; message: string }) {
    return this.whatsapp.sendMessage(body.to, body.message);
  }
}
