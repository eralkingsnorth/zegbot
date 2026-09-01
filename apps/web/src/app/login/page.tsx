"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { userLogin } from "@/lib/admin-api";

const inputClass =
  "mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition placeholder:text-slate-400";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    try {
      await userLogin({ email, password });
      router.push("/pricing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    }
  };

  return (
    <AppShell>
      <GlassCard className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-bold text-slate-900">Log in</h1>
        <p className="mt-1 text-sm text-slate-400">Welcome back to Zegbot</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={`${inputClass} mt-5`}
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
        <Button className="mt-5 w-full" onClick={submit}>
          Log in
        </Button>
        <p className="mt-4 text-center text-sm text-slate-400">
          <Link href="/forgot-password" className="text-blue-600 hover:underline font-medium">
            Forgot password?
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-400">
          No account?{" "}
          <Link href="/register" className="text-blue-600 hover:underline font-medium">
            Register
          </Link>
        </p>
      </GlassCard>
    </AppShell>
  );
}
