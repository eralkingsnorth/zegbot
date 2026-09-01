"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { resetPassword } from "@/lib/admin-api";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    }
  };

  return (
    <GlassCard className="mx-auto max-w-md p-6">
      {done ? (
        <>
          <h1 className="text-xl font-bold">Password updated</h1>
          <p className="mt-3 text-sm text-zinc-400">You can log in with your new password.</p>
          <Link href="/login">
            <Button className="mt-6 w-full">Log in</Button>
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">Reset password</h1>
          {!token && (
            <p className="mt-3 text-sm text-red-400">Missing reset token. Use the link from your email.</p>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none"
          />
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <Button className="mt-4 w-full" onClick={submit} disabled={!token}>
            Update password
          </Button>
        </>
      )}
    </GlassCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <AppShell>
      <Suspense fallback={<GlassCard className="mx-auto max-w-md p-6">Loading...</GlassCard>}>
        <ResetPasswordForm />
      </Suspense>
    </AppShell>
  );
}
