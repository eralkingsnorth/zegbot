"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreatePlanRequest, PlanInterval, SubscriptionPlan } from "@zegbot/shared";
import {
  createPlan,
  deletePlan,
  fetchAdminPlans,
  getAdminToken,
  syncPlanStripe,
  updatePlan,
} from "@/lib/admin-api";
import { formatPlanInterval, formatPlanPrice } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";

const emptyForm: CreatePlanRequest = {
  name: "",
  slug: "",
  price: 0,
  currency: "USD",
  interval: "month",
  description: "",
  features: ["Unlimited text chat"],
  voiceUsesPerMonth: null,
  textUsesPerDay: null,
  active: true,
  popular: false,
  sortOrder: 0,
};

function toSlug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [form, setForm] = useState<CreatePlanRequest>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [featuresText, setFeaturesText] = useState("Unlimited text chat");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const intervals: PlanInterval[] = useMemo(() => ["free", "month", "year"], []);

  const loadPlans = async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      setPlans(await fetchAdminPlans(token));
    } catch {
      setError("Could not load plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setFeaturesText("Unlimited text chat");
    setEditingId(null);
  };

  const startEdit = (plan: SubscriptionPlan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      slug: plan.slug,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      description: plan.description,
      features: plan.features,
      voiceUsesPerMonth: plan.voiceUsesPerMonth,
      textUsesPerDay: plan.textUsesPerDay,
      active: plan.active,
      popular: plan.popular,
      sortOrder: plan.sortOrder,
    });
    setFeaturesText(plan.features.join("\n"));
  };

  const savePlan = async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    setError("");
    setMessage("");
    const payload: CreatePlanRequest = {
      ...form,
      slug: form.slug || toSlug(form.name),
      features: featuresText.split("\n").map((l) => l.trim()).filter(Boolean),
    };
    try {
      if (editingId) {
        await updatePlan(token, editingId, payload);
        setMessage("Plan updated.");
      } else {
        await createPlan(token, payload);
        setMessage("Plan created.");
      }
      resetForm();
      await loadPlans();
    } catch {
      setError("Could not save plan");
    } finally {
      setLoading(false);
    }
  };

  const removePlan = async (id: string) => {
    const token = await getAdminToken();
    if (!token || !confirm("Delete this plan?")) return;
    try {
      await deletePlan(token, id);
      if (editingId === id) resetForm();
      await loadPlans();
      setMessage("Plan deleted.");
    } catch {
      setError("Could not delete plan");
    }
  };

  const syncStripe = async (id: string) => {
    const token = await getAdminToken();
    if (!token) return;
    setError("");
    setMessage("");
    try {
      await syncPlanStripe(token, id);
      setMessage("Plan synced to Stripe.");
      await loadPlans();
    } catch {
      setError("Stripe sync failed. Check STRIPE_SECRET_KEY in API .env");
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold">Plans</h2>
        <p className="text-sm text-zinc-400">Create plans and connect them to Stripe.</p>
      </section>

      {(error || message) && (
        <p className={`text-sm ${error ? "text-red-400" : "text-emerald-400"}`}>
          {error || message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="p-6">
          <h3 className="font-semibold">{editingId ? "Edit plan" : "New plan"}</h3>
          <div className="mt-4 space-y-3">
            <input
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  name: e.target.value,
                  slug: f.slug || toSlug(e.target.value),
                }))
              }
              placeholder="Plan name"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none"
            />
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="slug"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none"
              />
              <select
                value={form.interval}
                onChange={(e) =>
                  setForm((f) => ({ ...f, interval: e.target.value as PlanInterval }))
                }
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none"
              >
                {intervals.map((i) => (
                  <option key={i} value={i}>
                    {formatPlanInterval(i)}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none"
            />
            <textarea
              value={featuresText}
              onChange={(e) => setFeaturesText(e.target.value)}
              rows={4}
              placeholder="Features (one per line)"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={savePlan} disabled={loading || !form.name.trim()}>
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </GlassCard>

        <div className="space-y-3">
          {plans.map((plan) => (
            <GlassCard key={plan.id} className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-semibold">{plan.name}</p>
                  <p className="text-sm text-indigo-300">
                    {formatPlanPrice(plan)} · {formatPlanInterval(plan.interval)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Stripe: {plan.stripePriceId ? "Connected" : "Not synced"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {plan.price > 0 && (
                    <Button variant="secondary" onClick={() => syncStripe(plan.id)}>
                      Sync Stripe
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => startEdit(plan)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => removePlan(plan.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  );
}
