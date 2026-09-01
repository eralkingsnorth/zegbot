export type MessageChannel = 'whatsapp' | 'telegram' | 'email' | 'in-app';

export interface StoredMessage {
  id: string;
  channel: MessageChannel;
  from: string;
  to: string;
  body: string;
  timestamp: string;
  direction: 'in' | 'out';
}

export interface AiChatRequest {
  message: string;
}

export interface AiChatResponse {
  reply: string;
  actions?: Array<{ type: string; detail: string }>;
}

export type WhatsAppStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'connected';

export interface WhatsAppState {
  status: WhatsAppStatus;
  qr?: string;
  phone?: string;
}
