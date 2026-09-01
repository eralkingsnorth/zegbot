import { Injectable } from '@nestjs/common';
import type { StoredMessage } from '@zegbot/shared';

@Injectable()
export class MessagesService {
  private messages: StoredMessage[] = [];

  add(message: StoredMessage) {
    this.messages.unshift(message);
    if (this.messages.length > 500) {
      this.messages.pop();
    }
  }

  listToday(): StoredMessage[] {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.messages.filter(
      (m) => new Date(m.timestamp).getTime() >= start.getTime(),
    );
  }

  listAll(limit = 50): StoredMessage[] {
    return this.messages.slice(0, limit);
  }
}
