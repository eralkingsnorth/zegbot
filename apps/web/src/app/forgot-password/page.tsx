"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { forgotPassword } from "@/lib/admin-api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    try {
      await forgotPassword({ email });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    }
  };

  return (
    <AppShell>
      <GlassCard className="mx-auto max-w-md p-8">
        {done ? (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-2xl">
              📬
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
            <p className="mt-3 text-sm text-slate-500">
              If that address is registered, we sent a password reset link.
            </p>
            <Link href="/login">
              <Button className="mt-6 w-full" variant="secondary">
                Back to log in
              </Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Forgot password</h1>
            <p className="mt-2 text-sm text-slate-400">
              Enter your email and we&apos;ll send a reset link.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition placeholder:text-slate-400"
            />
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <Button className="mt-5 w-full" onClick={submit}>
              Send reset link
            </Button>
            <p className="mt-4 text-center text-sm text-slate-400">
              <Link href="/login" className="text-blue-600 hover:underline font-medium">
                Back to log in
              </Link>
            </p>
          </>
        )}
      </GlassCard>
    </AppShell>
  );
}
