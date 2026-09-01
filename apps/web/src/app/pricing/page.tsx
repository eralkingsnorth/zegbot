import type { SubscriptionPlan } from "@zegbot/shared";
import { AppShell } from "@/components/AppShell";
import { PricingCards } from "@/components/PricingCards";
import { fetchPlans } from "@/lib/api";

export default async function PricingPage() {
  let plans: SubscriptionPlan[] = [];
  try {
    plans = await fetchPlans();
  } catch {
    plans = [];
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="animate-fade-up">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Simple <span className="gradient-text">pricing</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
            Pick a plan that fits how you use Zegbot every day.
          </p>
        </section>

        <PricingCards plans={plans} />
      </div>
    </AppShell>
  );
}
