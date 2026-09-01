import { Controller, Get, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('today')
  today() {
    return this.messages.listToday();
  }

  @Get()
  list(@Query('limit') limit?: string) {
    return this.messages.listAll(limit ? Number(limit) : 50);
  }
}
