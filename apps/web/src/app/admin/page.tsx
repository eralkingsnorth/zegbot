"use client";

import { useEffect, useState } from "react";
import type { AdminDashboardStats } from "@zegbot/shared";
import { fetchDashboard, getAdminToken } from "@/lib/admin-api";
import { GlassCard } from "@/components/ui/GlassCard";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const token = await getAdminToken();
      if (!token) return;
      try {
        setStats(await fetchDashboard(token));
      } catch {
        setError("Could not load dashboard");
      }
    })();
  }, []);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!stats) return <p className="text-slate-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-sm text-slate-400">Overview of your customers and revenue.</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <GlassCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total users</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.totalUsers}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active subscriptions</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.activeSubscriptions}</p>
        </GlassCard>
        <GlassCard className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estimated MRR</p>
          <p className="mt-2 text-3xl font-bold gradient-text">${stats.estimatedMrr.toFixed(2)}</p>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h3 className="font-semibold text-slate-900">Users by plan</h3>
        <div className="mt-4 space-y-2">
          {stats.usersByPlan.map((row) => (
            <div
              key={row.planId}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm border border-slate-100"
            >
              <span className="text-slate-700">{row.planName}</span>
              <span className="font-semibold text-slate-900">{row.count}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
