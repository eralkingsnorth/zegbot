import { cn } from "@/lib/cn";
import type { MessageChannel } from "@zegbot/shared";

export const CHANNEL_META: Record<
  MessageChannel,
  { label: string; color: string; bg: string; border: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  messenger: {
    label: "Messenger",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  telegram: {
    label: "Telegram",
    color: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
  },
  email: {
    label: "Email",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  "in-app": {
    label: "Zegbot",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
  },
};

export function PlatformBadge({
  channel,
}: {
  channel: MessageChannel | string;
}) {
  const meta =
    CHANNEL_META[(channel as MessageChannel) ?? "in-app"] ?? CHANNEL_META["in-app"];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        meta.color,
        meta.bg,
        meta.border,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

export function displayContact(contact: string) {
  return contact
    .replace(/@s\.whatsapp\.net$/, "")
    .replace(/@g\.us$/, " (group)")
    .replace(/@lid$/, "");
}

export function initials(contact: string) {
  const name = displayContact(contact).trim();
  const parts = name.split(/[\s+]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}
