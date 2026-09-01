import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessagesService } from '../messages/messages.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly messages: MessagesService,
  ) {}

  afterInit() {
    this.whatsapp.on('state', (state) => {
      this.server.emit('whatsapp:state', state);
    });
    this.whatsapp.on('message', (msg) => {
      this.server.emit('whatsapp:message', msg);
    });
    this.messages.on('message', (msg) => {
      this.server.emit('inbox:message', msg);
    });
    this.messages.on('read', (payload) => {
      this.server.emit('inbox:read', payload);
    });
    this.messages.on('sync', (payload) => {
      this.server.emit('inbox:sync', payload);
    });
  }
}
