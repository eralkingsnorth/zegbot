import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly whatsapp: WhatsappService) {}

  afterInit() {
    this.whatsapp.on('state', (state) => {
      this.server.emit('whatsapp:state', state);
    });
    this.whatsapp.on('message', (msg) => {
      this.server.emit('whatsapp:message', msg);
    });
  }
}
