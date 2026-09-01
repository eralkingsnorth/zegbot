import { Controller, Get, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get('status')
  status() {
    return this.whatsapp.getState();
  }

  @Get('usage')
  usage() {
    return this.whatsapp.usage();
  }

  @Post('connect')
  connect() {
    return this.whatsapp.connect();
  }

  @Post('logout')
  logout() {
    return this.whatsapp.logout();
  }

  @Post('pairing-code')
  pairingCode(@Body() body: { phone: string }) {
    return this.whatsapp.requestPairingCode(body.phone);
  }

  @Post('send')
  send(@Body() body: { to: string; message: string }) {
    return this.whatsapp.sendMessage(body.to, body.message);
  }
}
