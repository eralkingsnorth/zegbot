import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChannelsService } from './channels.service';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list() {
    return this.channels.list();
  }

  @Get('messenger/login')
  messengerLogin() {
    return this.channels.messengerLoginUrl();
  }

  @Get('messenger/callback')
  async messengerCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const ok = !error && (await this.channels.handleMessengerCallback(code));
    const dest = ok
      ? 'zegbot://onboarding/messenger?ok=1'
      : 'zegbot://onboarding/messenger?error=1';
    res.redirect(dest);
  }
}
