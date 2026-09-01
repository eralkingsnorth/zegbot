import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  chat(@Body() body: { message: string; context?: string; tone?: string }) {
    return this.ai.chat(body.message, {
      context: body.context,
      tone: body.tone,
    });
  }

  @Post('confirm')
  confirm(@Body() body: { token: string }) {
    return this.ai.confirm(body.token);
  }

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  transcribe(@UploadedFile() file: Express.Multer.File) {
    return this.ai.transcribe(file);
  }
}
