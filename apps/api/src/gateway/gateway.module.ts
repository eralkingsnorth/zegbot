import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [WhatsappModule, MessagesModule],
  providers: [EventsGateway],
})
export class GatewayModule {}
