import type {
  AuthForgotPasswordRequest,
  AuthLoginRequest,
  AuthMeResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthResetPasswordRequest,
  AuthResendVerificationRequest,
  AuthResponse,
  AuthVerifyEmailCodeRequest,
  AuthVerifyEmailRequest,
  ChannelInfo,
  Conversation,
  OnboardingUpdateRequest,
  StoredMessage,
  SubscriptionPlan,
  WhatsAppState,
} from "@zegbot/shared";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3002";

/** Tells the API to return the refresh token in the body instead of a cookie. */
const nativeJsonHeaders = {
  "Content-Type": "application/json",
  "x-zegbot-client": "native",
};

async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const msg = (data as { message?: string | string[] }).message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg) return msg;
  return fallback;
}

export async function fetchPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch(`${API_URL}/plans`);
  if (!res.ok) throw new Error("Could not load plans");
  return res.json();
}

export function formatPlanPrice(plan: SubscriptionPlan): string {
  if (plan.interval === "free" || plan.price === 0) return "Free";
  const amount = plan.price.toFixed(2);
  if (plan.interval === "year") return `$${amount}/yr`;
  return `$${amount}/mo`;
}

export async function userLogin(body: AuthLoginRequest): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: nativeJsonHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Invalid login"));
  return res.json();
}

export async function userRegister(
  body: AuthRegisterRequest,
): Promise<AuthRegisterResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not register"));
  return res.json();
}

export async function verifyEmail(
  body: AuthVerifyEmailRequest,
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/verify-email`, {
    method: "POST",
    headers: nativeJsonHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not verify email"));
  return res.json();
}

export async function forgotPassword(
  body: AuthForgotPasswordRequest,
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not send reset email"));
  return res.json();
}

export async function resetPassword(
  body: AuthResetPasswordRequest,
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not reset password"));
  return res.json();
}

export async function fetchMe(token: string): Promise<AuthMeResponse> {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readError(res, "Could not load account"));
  return res.json();
}

export async function createCheckout(planId: string, token: string): Promise<string> {
  const res = await fetch(`${API_URL}/billing/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not start checkout"));
  const data = await res.json();
  return data.url as string;
}

export async function verifyEmailCode(
  body: AuthVerifyEmailCodeRequest,
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/verify-email-code`, {
    method: "POST",
    headers: nativeJsonHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not verify email"));
  return res.json();
}

export async function resendVerification(
  body: AuthResendVerificationRequest,
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not resend code"));
  return res.json();
}

export async function updateOnboarding(
  token: string,
  body: OnboardingUpdateRequest,
): Promise<AuthMeResponse> {
  const res = await fetch(`${API_URL}/auth/onboarding`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not save setup"));
  return res.json();
}

export async function fetchChannels(): Promise<ChannelInfo[]> {
  const res = await fetch(`${API_URL}/channels`);
  if (!res.ok) throw new Error(await readError(res, "Could not load channels"));
  return res.json();
}

export async function fetchMessengerLogin(): Promise<
  { available: true; url: string } | { available: false; message: string }
> {
  const res = await fetch(`${API_URL}/channels/messenger/login`);
  if (!res.ok) throw new Error(await readError(res, "Could not start Facebook login"));
  return res.json();
}

export async function requestWhatsAppPairing(phone: string): Promise<WhatsAppState> {
  const res = await fetch(`${API_URL}/whatsapp/pairing-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not get pairing code"));
  return res.json();
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_URL}/messages/conversations`);
  if (!res.ok) throw new Error(await readError(res, "Could not load inbox"));
  return res.json();
}

export async function fetchThread(
  channel: string,
  contact: string,
): Promise<StoredMessage[]> {
  const params = new URLSearchParams({ channel, contact, limit: "100" });
  const res = await fetch(`${API_URL}/messages?${params.toString()}`);
  if (!res.ok) throw new Error(await readError(res, "Could not load chat"));
  return res.json();
}

export async function sendChannelMessage(
  channel: string,
  to: string,
  message: string,
): Promise<void> {
  if (channel !== "whatsapp") {
    throw new Error("Sending on this channel is not available yet");
  }
  const res = await fetch(`${API_URL}/whatsapp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not send"));
}

export async function askAi(body: {
  message: string;
  context?: string;
  tone?: string;
}): Promise<import("@zegbot/shared").AiChatResponse> {
  const res = await fetch(`${API_URL}/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, "AI request failed"));
  return res.json();
}

export async function transcribeVoice(uri: string): Promise<string> {
  const form = new FormData();
  form.append("audio", {
    uri,
    name: "voice.m4a",
    type: "audio/m4a",
  } as unknown as Blob);
  const res = await fetch(`${API_URL}/ai/transcribe`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res, "Could not transcribe audio"));
  const data = (await res.json()) as { text: string };
  return data.text;
}

export async function confirmAiAction(
  token: string,
): Promise<import("@zegbot/shared").AiChatResponse> {
  const res = await fetch(`${API_URL}/ai/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not confirm action"));
  return res.json();
}
