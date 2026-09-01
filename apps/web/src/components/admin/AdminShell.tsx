"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAdminToken, getAdminToken } from "@/lib/admin-api";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/users", label: "Users", icon: "👤" },
  { href: "/admin/plans", label: "Plans", icon: "$" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (pathname === "/admin/login") {
      setReady(true);
      return;
    }
    void getAdminToken().then((token) => {
      if (cancelled) return;
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (!ready) return null;

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="mesh-bg" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-6 shadow-sm lg:flex">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 text-sm font-bold text-white">
              Z
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Zegbot Admin</p>
              <p className="text-xs text-slate-400">Web only</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  pathname === item.href
                    ? "bg-gradient-to-r from-blue-50 to-violet-50 text-blue-700 border border-blue-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                )}
              >
                <span className={pathname === item.href ? "text-blue-600" : "opacity-60"}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            className="mt-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition text-left"
            onClick={() => {
              clearAdminToken();
              router.push("/admin/login");
            }}
          >
            <span className="opacity-60">↩</span>
            Log out
          </button>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md px-5 py-4 lg:px-8">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-slate-900">Admin panel</h1>
              <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition">
                ← Back to app
              </Link>
            </div>
          </header>
          <main className="flex-1 px-5 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
