import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { EmailModule } from './email/email.module';
import { MessagesModule } from './messages/messages.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { StripeModule } from './stripe/stripe.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { GatewayModule } from './gateway/gateway.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EmailModule,
    WhatsappModule,
    ChannelsModule,
    MessagesModule,
    AiModule,
    PlansModule,
    UsersModule,
    forwardRef(() => AuthModule),
    StripeModule,
    GatewayModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
