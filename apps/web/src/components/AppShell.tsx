"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { brand } from "@zegbot/theme";
import { cn } from "@/lib/cn";
import { clearUserToken, getUserToken } from "@/lib/admin-api";

const nav = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/inbox", label: "Inbox", icon: "✉" },
  { href: "/channels", label: "Channels", icon: "⎘" },
  { href: "/pricing", label: "Pricing", icon: "$" },
];

export function AppShell({
  children,
  fill = false,
}: {
  children: React.ReactNode;
  fill?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getUserToken().then((token) => {
      if (!cancelled) setLoggedIn(!!token);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const logout = () => {
    clearUserToken();
    setLoggedIn(false);
    router.push("/login");
  };

  return (
    <div className={cn("relative bg-slate-50", fill ? "h-screen overflow-hidden" : "min-h-screen")}>
      <div className="mesh-bg" />

      <div className={cn("relative z-10 mx-auto flex max-w-7xl", fill ? "h-full" : "min-h-screen")}>
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-6 lg:flex shadow-sm">
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-lg font-bold text-white shadow-md shadow-blue-200">
                Z
              </div>
              <div>
                <p className="text-base font-bold tracking-tight text-slate-900">{brand.name}</p>
                <p className="text-xs text-slate-400">{brand.tagline}</p>
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-gradient-to-r from-blue-50 to-violet-50 text-blue-700 border border-blue-100"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                  )}
                >
                  <span
                    className={cn(
                      "text-base",
                      active ? "text-blue-600" : "opacity-60",
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Channels</p>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                WhatsApp Web
              </div>
              <p className="text-slate-400 pl-3.5">Telegram · soon</p>
              <p className="text-slate-400 pl-3.5">Email · soon</p>
            </div>
          </div>
        </aside>

        <div className={cn("flex flex-1 flex-col", fill ? "h-full min-h-0" : "min-h-screen")}>
          {/* Header */}
          <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur-md px-5 py-3.5 lg:px-8">
            <div className="flex items-center justify-between">
              <div className="lg:hidden">
                <p className="text-base font-bold text-slate-900">{brand.name}</p>
                <p className="text-xs text-slate-400">{brand.tagline}</p>
              </div>
              <div className="hidden lg:block">
                <h1 className="text-lg font-semibold text-slate-900">
                  Your messaging command center
                </h1>
                <p className="text-sm text-slate-400">
                  Connect apps, ask AI, send messages — all in one place
                </p>
              </div>
              <div className="flex items-center gap-2">
                {loggedIn ? (
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                  >
                    Log out
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-full bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:shadow-md transition"
                  >
                    Log in
                  </Link>
                )}
              </div>
            </div>
          </header>

          <main
            className={cn(
              "flex-1",
              fill ? "min-h-0 overflow-hidden" : "px-5 py-6 lg:px-8 lg:py-8",
            )}
          >
            {children}
          </main>

          {/* Mobile bottom nav */}
          <nav className="sticky bottom-0 z-20 grid shrink-0 grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur-md px-2 py-2 lg:hidden">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition",
                    active ? "text-blue-600" : "text-slate-400",
                  )}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
