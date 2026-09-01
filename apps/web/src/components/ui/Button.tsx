import { cn } from "@/lib/cn";

const variants = {
  primary: "gradient-btn text-white",
  secondary:
    "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm",
  whatsapp: "bg-[#25d366] text-white shadow-md shadow-emerald-200 hover:brightness-105",
  ghost: "text-slate-500 hover:text-slate-900 hover:bg-slate-100",
};

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
