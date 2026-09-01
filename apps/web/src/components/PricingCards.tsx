"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SubscriptionPlan } from "@zegbot/shared";
import { createCheckout, getUserToken } from "@/lib/admin-api";
import { formatPlanPrice } from "@/lib/api";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function PricingCards({ plans }: { plans: SubscriptionPlan[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const subscribe = async (plan: SubscriptionPlan) => {
    setError("");
    const token = await getUserToken();
    if (!token) {
      router.push("/login");
      return;
    }
    if (plan.interval === "free" || plan.price === 0) return;

    setLoadingId(plan.id);
    try {
      const url = await createCheckout(plan.id, token);
      window.location.href = url;
    } catch {
      setError("Checkout failed. Plan may need Stripe sync in admin.");
    } finally {
      setLoadingId(null);
    }
  };

  if (plans.length === 0) {
    return (
      <GlassCard className="p-8 text-center text-slate-400">
        No plans available yet.
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <GlassCard
            key={plan.id}
            strong={plan.popular}
            className={cn(
              "relative flex flex-col p-6",
              plan.popular && "ring-2 ring-blue-400/50",
            )}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-0.5 text-xs font-semibold text-white shadow-sm">
                Most popular
              </span>
            )}

            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{plan.name}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatPlanPrice(plan)}</p>
            <p className="mt-2 text-sm text-slate-500">{plan.description}</p>

            <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span className="gradient-text font-bold">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {plan.price > 0 && (
              <Button
                className="mt-5 w-full"
                onClick={() => subscribe(plan)}
                disabled={loadingId === plan.id}
              >
                {loadingId === plan.id ? "Loading…" : "Subscribe"}
              </Button>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
