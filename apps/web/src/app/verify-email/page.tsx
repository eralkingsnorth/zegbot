"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { verifyEmail } from "@/lib/admin-api";

function VerifyEmailInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"loading" | "ok" | "error">(
    token ? "loading" : "error",
  );

  useEffect(() => {
    if (!token) {
      setError("Missing verification token.");
      setStatus("error");
      return;
    }

    let cancelled = false;
    verifyEmail({ token })
      .then(() => {
        if (cancelled) return;
        setStatus("ok");
        router.replace("/");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not verify email");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <GlassCard className="mx-auto max-w-md p-6">
      {status === "loading" && (
        <>
          <h1 className="text-xl font-bold">Verifying email</h1>
          <p className="mt-3 text-sm text-zinc-400">Please wait...</p>
        </>
      )}
      {status === "ok" && (
        <>
          <h1 className="text-xl font-bold">Email verified</h1>
          <p className="mt-3 text-sm text-zinc-400">Redirecting you into Zegbot...</p>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="text-xl font-bold">Could not verify</h1>
          <p className="mt-3 text-sm text-red-400">{error}</p>
          <Link href="/login">
            <Button className="mt-6 w-full" variant="secondary">
              Go to log in
            </Button>
          </Link>
        </>
      )}
    </GlassCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <AppShell>
      <Suspense fallback={<GlassCard className="mx-auto max-w-md p-6">Loading...</GlassCard>}>
        <VerifyEmailInner />
      </Suspense>
    </AppShell>
  );
}
