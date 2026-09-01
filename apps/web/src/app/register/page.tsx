"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { userRegister } from "@/lib/admin-api";

const inputClass =
  "mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition placeholder:text-slate-400";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    try {
      await userRegister({ name, email, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register");
    }
  };

  return (
    <AppShell>
      <GlassCard className="mx-auto max-w-md p-8">
        {done ? (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl">
              ✉️
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
            <p className="mt-3 text-sm text-slate-500">
              We sent a confirmation email to{" "}
              <span className="font-semibold text-slate-800">{email}</span>.
              Open it to activate your account, then log in.
            </p>
            <Link href="/login">
              <Button className="mt-6 w-full">Go to log in</Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Create account</h1>
            <p className="mt-1 text-sm text-slate-400">Get started with Zegbot for free</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className={`${inputClass} mt-5`}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={inputClass}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 characters)"
              className={inputClass}
            />
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <Button className="mt-5 w-full" onClick={submit}>
              Create account
            </Button>
            <p className="mt-4 text-center text-sm text-slate-400">
              Already have an account?{" "}
              <Link href="/login" className="text-blue-600 hover:underline font-medium">
                Log in
              </Link>
            </p>
          </>
        )}
      </GlassCard>
    </AppShell>
  );
}
