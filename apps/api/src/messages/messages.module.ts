import { Module, forwardRef } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

function uploadsDir() {
  const dataDir = process.env.DATA_DIR ?? join(process.cwd(), '..', '..', 'data');
  const dir = join(dataDir, 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function mimeExt(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'audio/webm') return '.webm';
  if (mime === 'audio/mpeg') return '.mp3';
  if (mime === 'audio/ogg') return '.ogg';
  if (mime === 'audio/wav') return '.wav';
  return '';
}

@Module({
  imports: [
    forwardRef(() => WhatsappModule),
    MulterModule.register({
      limits: { fileSize: 15 * 1024 * 1024 },
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadsDir()),
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname) || mimeExt(file.mimetype);
          cb(null, `${Date.now()}-${randomUUID()}${ext}`);
        },
      }),
    }),
  ],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
