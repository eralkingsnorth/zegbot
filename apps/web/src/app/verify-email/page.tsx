"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { verifyEmail } from "@/lib/admin-api";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") ?? "";

    if (!t) {
      setError("Missing verification token.");
      setStatus("error");
      return;
    }

    let cancelled = false;
    verifyEmail({ token: t })
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
  }, [router]);

  return (
    <AppShell>
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
            <p className="mt-3 text-sm text-red-400">{error || "Missing verification token."}</p>
            <Link href="/login">
              <Button className="mt-6 w-full" variant="secondary">
                Go to log in
              </Button>
            </Link>
          </>
        )}
      </GlassCard>
    </AppShell>
  );
}
