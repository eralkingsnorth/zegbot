import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  providers: [EventsGateway],
})
export class GatewayModule {}
