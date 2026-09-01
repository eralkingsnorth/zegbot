import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.use(cookieParser());
  app.enableCors({
    origin: true,
    credentials: true,
  });
  const dataDir =
    process.env.DATA_DIR ?? join(process.cwd(), '..', '..', 'data');
  const uploads = join(dataDir, 'uploads');
  mkdirSync(uploads, { recursive: true });
  app.useStaticAssets(uploads, { prefix: '/uploads/' });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
