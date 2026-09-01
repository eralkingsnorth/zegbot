import { cn } from "@/lib/cn";

export function GlassCard({
  children,
  className,
  strong = false,
}: {
  children: React.ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl p-6",
        strong ? "glass-strong" : "glass",
        className,
      )}
    >
      {children}
    </section>
  );
}
