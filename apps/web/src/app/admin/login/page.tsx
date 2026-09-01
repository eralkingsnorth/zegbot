"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminLogin } from "@/lib/admin-api";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";

const inputClass =
  "mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition placeholder:text-slate-400";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      await adminLogin({ email, password });
      router.push("/admin");
    } catch {
      setError("Wrong email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="mesh-bg" />
      <GlassCard className="relative z-10 w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-lg font-bold text-white">
            Z
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin login</h1>
            <p className="text-xs text-slate-400">Manage users, plans and Stripe</p>
          </div>
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputClass}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className={inputClass}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <Button className="mt-5 w-full" onClick={submit} disabled={loading}>
          {loading ? "Logging in…" : "Log in"}
        </Button>
      </GlassCard>
    </div>
  );
}
