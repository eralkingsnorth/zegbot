import type {
  Conversation,
  MessageChannel,
  StoredMessage,
  SubscriptionPlan,
  PlanInterval,
} from "@zegbot/shared";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function mediaUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API}${path}`;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API}/messages/conversations`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load inbox");
  return res.json();
}

export async function fetchThread(
  channel: string,
  contact: string,
): Promise<StoredMessage[]> {
  const params = new URLSearchParams({ channel, contact, limit: "200" });
  const res = await fetch(`${API}/messages?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load chat");
  return res.json();
}

export async function markConversationRead(channel: string, contact: string) {
  await fetch(`${API}/messages/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, contact }),
  });
}

export async function sendInboxMessage(opts: {
  channel: MessageChannel | string;
  to: string;
  body?: string;
  files?: File[];
}) {
  const form = new FormData();
  form.append("channel", opts.channel);
  form.append("to", opts.to);
  form.append("body", opts.body ?? "");
  for (const file of opts.files ?? []) form.append("files", file);
  const res = await fetch(`${API}/messages/send`, { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { message?: string }).message;
    throw new Error(msg || "Could not send");
  }
}

export async function askAi(body: {
  message: string;
  context?: string;
  tone?: string;
}): Promise<import("@zegbot/shared").AiChatResponse> {
  const res = await fetch(`${API}/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("AI request failed");
  return res.json();
}

export async function transcribeVoice(audio: Blob, filename = "voice.webm"): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, filename);
  const res = await fetch(`${API}/ai/transcribe`, { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { message?: string }).message;
    throw new Error(msg || "Could not transcribe audio");
  }
  const data = (await res.json()) as { text: string };
  return data.text;
}

export async function confirmAiAction(token: string): Promise<import("@zegbot/shared").AiChatResponse> {
  const res = await fetch(`${API}/ai/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error("Could not confirm action");
  return res.json();
}

export async function fetchPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch(`${API}/plans`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load plans");
  return res.json();
}

export function formatPlanPrice(plan: SubscriptionPlan): string {
  if (plan.interval === "free" || plan.price === 0) return "Free";
  const amount = plan.price.toFixed(2);
  if (plan.interval === "year") return `$${amount}/yr`;
  return `$${amount}/mo`;
}

export function formatPlanInterval(interval: PlanInterval): string {
  if (interval === "free") return "Free";
  if (interval === "year") return "Yearly";
  return "Monthly";
}
