"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { WhatsAppState } from "@zegbot/shared";
import { statusTone } from "@zegbot/theme";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const QR_TTL_SEC = 20;

export function WhatsAppConnect({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<WhatsAppState>({ status: "disconnected" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [qrLeft, setQrLeft] = useState(QR_TTL_SEC);

  useEffect(() => {
    const load = () => {
      fetch(`${API}/whatsapp/status`)
        .then((r) => r.json())
        .then(setState)
        .catch(() => {});
    };
    load();
    const poll = setInterval(load, 1500);
    const socket = io(API);
    socket.on("whatsapp:state", setState);
    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!state.qr) return;
    setQrLeft(QR_TTL_SEC);
    const started = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, QR_TTL_SEC - Math.floor((Date.now() - started) / 1000));
      setQrLeft(left);
    }, 250);
    return () => clearInterval(tick);
  }, [state.qr]);

  const connect = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API}/whatsapp/connect`, { method: "POST" });
      if (!res.ok) throw new Error("Connect failed");
      const next = (await res.json()) as WhatsAppState;
      setState(next);
      if (next.error) setError(next.error);
    } catch {
      setError("Could not reach the API. Wait a second and try Connect again.");
    } finally {
      setBusy(false);
    }
  };

  const pair = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API}/whatsapp/pairing-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const next = (await res.json()) as WhatsAppState & { message?: string };
      if (!res.ok) throw new Error(next.message || "Could not get pairing code");
      setState(next);
      if (next.error) setError(next.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get pairing code");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API}/whatsapp/logout`, { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed");
      setState(await res.json());
    } catch {
      setError("Could not disconnect. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const message = error || state.error;

  return (
    <GlassCard className="animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xl">💬</span>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">WhatsApp</h2>
          </div>
          <p className="text-sm text-slate-500">
            Link your account via WhatsApp Web
          </p>
        </div>
        <StatusBadge label={state.status} tone={statusTone(state.status)} />
      </div>

      {state.phone && (
        <p className="mt-4 text-sm text-slate-500">
          Connected as <span className="font-semibold text-slate-800">{state.phone}</span>
        </p>
      )}

      {message && state.status !== "connected" && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}

      {state.status !== "connected" && (
        <>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="whatsapp" onClick={connect} disabled={busy}>
              {busy ? "Connecting…" : "Show QR code"}
            </Button>
            {state.status !== "disconnected" && (
              <Button variant="secondary" onClick={disconnect} disabled={busy}>
                Disconnect
              </Button>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Or link with a pairing code</p>
            <p className="mt-1 text-xs text-slate-500">
              Enter your number with country code. Then in WhatsApp: Linked devices → Link a device → Link with phone number.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="94771234567"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400"
              />
              <Button variant="secondary" onClick={pair} disabled={busy}>
                Get code
              </Button>
            </div>
            {state.pairingCode && (
              <p className="mt-4 text-center font-mono text-3xl font-bold tracking-[0.3em] text-slate-900">
                {state.pairingCode}
              </p>
            )}
          </div>
        </>
      )}

      {state.qr && (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="mb-4 text-center text-sm text-slate-500">
            Open WhatsApp → Linked devices → Link a device, then scan this QR
          </p>
          <div
            className={`rounded-2xl bg-white p-3 shadow-md ${qrLeft === 0 ? "opacity-40" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.qr} alt="WhatsApp QR code" className="h-52 w-52 sm:h-64 sm:w-64" />
          </div>
          <p className="mt-3 text-center text-sm font-medium text-slate-600">
            {qrLeft > 0
              ? `Refreshes in ${qrLeft}s`
              : "Expired — waiting for a new QR…"}
          </p>
        </div>
      )}

      {state.status === "connected" && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!compact && (
            <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              WhatsApp is live. Open Inbox — chats sync in the first minute after you link.
            </div>
          )}
          <Button variant="secondary" onClick={disconnect} disabled={busy}>
            Disconnect
          </Button>
        </div>
      )}
    </GlassCard>
  );
}
