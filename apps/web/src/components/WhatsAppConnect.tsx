"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { WhatsAppState } from "@zegbot/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function WhatsAppConnect() {
  const [state, setState] = useState<WhatsAppState>({ status: "disconnected" });

  useEffect(() => {
    fetch(`${API}/whatsapp/status`)
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});

    const socket = io(API);
    socket.on("whatsapp:state", setState);
    return () => {
      socket.disconnect();
    };
  }, []);

  const connect = async () => {
    const res = await fetch(`${API}/whatsapp/connect`, { method: "POST" });
    setState(await res.json());
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">WhatsApp</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Status: <span className="font-medium text-zinc-800">{state.status}</span>
        {state.phone ? ` · ${state.phone}` : ""}
      </p>

      {state.status !== "connected" && (
        <button
          onClick={connect}
          className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Connect WhatsApp Web
        </button>
      )}

      {state.qr && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-zinc-600">
            Scan with WhatsApp on your phone
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="WhatsApp QR code" className="h-56 w-56" />
        </div>
      )}
    </section>
  );
}
