import { cn } from "@/lib/cn";
import type { StatusTone } from "@zegbot/theme";

const toneStyles: Record<StatusTone, string> = {
  default: "bg-slate-100 text-slate-600 border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-600 border-red-200",
  accent: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

const dotColor: Record<StatusTone, string> = {
  default: "bg-slate-400",
  success: "bg-emerald-500",
  warning: "bg-amber-400 animate-pulse-soft",
  danger: "bg-red-500",
  accent: "bg-cyan-500",
};

export function StatusBadge({
  label,
  tone = "default",
  dot = true,
  className,
}: {
  label: string;
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
        toneStyles[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColor[tone])} />}
      {label}
    </span>
  );
}
