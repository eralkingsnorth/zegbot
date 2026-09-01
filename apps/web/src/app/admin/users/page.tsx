"use client";

import { useEffect, useState } from "react";
import type { SubscriptionPlan } from "@zegbot/shared";
import {
  changeUserPlan,
  fetchAdminPlans,
  fetchAdminUsers,
  getAdminToken,
  type AdminUserRow,
} from "@/lib/admin-api";
import { GlassCard } from "@/components/ui/GlassCard";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const token = await getAdminToken();
    if (!token) return;
    setLoading(true);
    try {
      const [userRows, planRows] = await Promise.all([
        fetchAdminUsers(token),
        fetchAdminPlans(token),
      ]);
      setUsers(userRows);
      setPlans(planRows);
    } catch {
      setError("Could not load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onPlanChange = async (userId: string, planId: string) => {
    const token = await getAdminToken();
    if (!token) return;
    setMessage("");
    setError("");
    try {
      await changeUserPlan(token, userId, planId);
      setMessage("Plan updated.");
      await load();
    } catch {
      setError("Could not update plan");
    }
  };

  if (loading) return <p className="text-slate-400">Loading users...</p>;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-slate-900">Users</h2>
        <p className="text-sm text-slate-400">
          {users.length} customer{users.length === 1 ? "" : "s"} — upgrade or downgrade plans.
        </p>
      </section>

      {message && <p className="text-sm font-medium text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="space-y-3">
        {users.length === 0 && (
          <GlassCard className="p-6 text-slate-400">No users yet.</GlassCard>
        )}
        {users.map((user) => (
          <GlassCard key={user.id} className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold text-slate-900">{user.name}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Current: {user.planName} · Status: {user.subscriptionStatus}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={user.planId}
                  onChange={(e) => onPlanChange(user.id, e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
