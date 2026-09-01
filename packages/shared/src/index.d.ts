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
    actions?: Array<{
        type: string;
        detail: string;
    }>;
}
export type WhatsAppStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';
export interface WhatsAppState {
    status: WhatsAppStatus;
    qr?: string;
    phone?: string;
}
export type PlanInterval = 'free' | 'month' | 'year';
export interface SubscriptionPlan {
    id: string;
    name: string;
    slug: string;
    price: number;
    currency: string;
    interval: PlanInterval;
    description: string;
    features: string[];
    voiceUsesPerMonth: number | null;
    textUsesPerDay: number | null;
    active: boolean;
    popular: boolean;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
}
export interface CreatePlanRequest {
    name: string;
    slug: string;
    price: number;
    currency?: string;
    interval: PlanInterval;
    description: string;
    features: string[];
    voiceUsesPerMonth?: number | null;
    textUsesPerDay?: number | null;
    active?: boolean;
    popular?: boolean;
    sortOrder?: number;
}
export interface UpdatePlanRequest extends Partial<CreatePlanRequest> {
}
