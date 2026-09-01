export type MessageChannel =
  | 'whatsapp'
  | 'messenger'
  | 'telegram'
  | 'email'
  | 'in-app';

export type MessageAttachmentKind = 'image' | 'audio' | 'file';

export interface MessageAttachment {
  id: string;
  kind: MessageAttachmentKind;
  name: string;
  mime: string;
  url: string;
  size: number;
}

export interface StoredMessage {
  id: string;
  channel: MessageChannel;
  from: string;
  to: string;
  body: string;
  timestamp: string;
  direction: 'in' | 'out';
  read: boolean;
  attachments?: MessageAttachment[];
}

export interface Conversation {
  id: string;
  channel: MessageChannel;
  contact: string;
  name?: string;
  lastMessage: string;
  lastTimestamp: string;
  lastDirection: 'in' | 'out';
  unreadCount: number;
}

export interface ChannelInfo {
  id: MessageChannel;
  name: string;
  description: string;
  available: boolean;
  connected: boolean;
  connectKind: 'live' | 'oauth' | 'placeholder';
  detail?: string;
}

export type OnboardingStep = 'channel' | 'configure' | 'ai' | 'done';

export interface AiChatRequest {
  message: string;
  context?: string;
  tone?: string;
}

export type AiActionType =
  | 'send_whatsapp'
  | 'summarize'
  | 'delete_message'
  | 'delete_conversation';

export interface AiPendingAction {
  type: AiActionType;
  label: string;
  channel: MessageChannel;
  contact: string;
  messageId?: string;
}

export interface AiChatResponse {
  reply: string;
  actions?: Array<{ type: string; detail: string }>;
  pendingAction?: AiPendingAction;
  confirmToken?: string;
}

export type WhatsAppStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr'
  | 'pairing'
  | 'connected';

export interface WhatsAppState {
  status: WhatsAppStatus;
  qr?: string;
  pairingCode?: string;
  pairingPhone?: string;
  phone?: string;
  error?: string;
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
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UserSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'none';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  planId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: UserSubscriptionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeSubscriptions: number;
  usersByPlan: Array<{ planId: string; planName: string; count: number }>;
  estimatedMrr: number;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthRegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  /** Short-lived access token. Keep in memory only. */
  token: string;
  /** Seconds until `token` expires. */
  expiresIn: number;
  /**
   * Long-lived refresh token. Only returned to native clients; on the web it is
   * delivered as an httpOnly cookie instead and this field is omitted.
   */
  refreshToken?: string;
  user: { id: string; email: string; name: string; role: 'admin' | 'user' };
}

export type AuthScope = 'admin' | 'user';

export interface AuthRefreshRequest {
  /** Native clients send the stored token; web relies on its cookie. */
  refreshToken?: string;
  scope?: AuthScope;
}

export interface AuthRefreshResponse {
  token: string;
  expiresIn: number;
  refreshToken?: string;
}

export interface AuthRegisterResponse {
  message: string;
}

export interface AuthVerifyEmailRequest {
  token: string;
}

export interface AuthVerifyEmailCodeRequest {
  email: string;
  code: string;
}

export interface AuthResendVerificationRequest {
  email: string;
}

export interface OnboardingUpdateRequest {
  step?: OnboardingStep;
  completed?: boolean;
  channel?: MessageChannel | null;
  aiTone?: string;
  aiAutoReply?: boolean;
}

export interface AuthForgotPasswordRequest {
  email: string;
}

export interface AuthResetPasswordRequest {
  token: string;
  password: string;
}

export interface AuthMeResponse {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  planId: string;
  planName: string;
  planSlug: string;
  subscriptionStatus: UserSubscriptionStatus;
  onboardingCompleted: boolean;
  onboardingStep: OnboardingStep;
  onboardingChannel: MessageChannel | null;
  aiTone: string;
  aiAutoReply: boolean;
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
  stripeProductId?: string | null;
  stripePriceId?: string | null;
}
