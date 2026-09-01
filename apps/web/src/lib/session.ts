import type { AuthResponse, AuthScope } from "@zegbot/shared";
import { API } from "./api";

/**
 * Access tokens live in module memory only — never localStorage — so an XSS
 * cannot steal a long-lived credential. The refresh token is an httpOnly
 * cookie the browser sends automatically, and it is what survives a reload.
 */
type Held = { token: string; expiresAt: number };

const held: Record<AuthScope, Held | null> = { user: null, admin: null };
const inFlight: Record<AuthScope, Promise<string | null> | null> = {
  user: null,
  admin: null,
};

/** Refresh a little early so a request never travels with an expiring token. */
const SKEW_MS = 30_000;

export function storeSession(scope: AuthScope, res: AuthResponse) {
  held[scope] = {
    token: res.token,
    expiresAt: Date.now() + Math.max(0, res.expiresIn * 1000),
  };
}

export function clearSession(scope: AuthScope) {
  held[scope] = null;
  inFlight[scope] = null;
}

export function peekToken(scope: AuthScope): string | null {
  const current = held[scope];
  return current && current.expiresAt - SKEW_MS > Date.now() ? current.token : null;
}

/**
 * Returns a usable access token, silently refreshing from the cookie when the
 * held one is missing or stale. Concurrent callers share one refresh request.
 */
export async function getAccessToken(scope: AuthScope = "user"): Promise<string | null> {
  const valid = peekToken(scope);
  if (valid) return valid;

  inFlight[scope] ??= refresh(scope).finally(() => {
    inFlight[scope] = null;
  });
  return inFlight[scope];
}

async function refresh(scope: AuthScope): Promise<string | null> {
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ scope }),
    });
    if (!res.ok) {
      held[scope] = null;
      return null;
    }
    const data = (await res.json()) as { token: string; expiresIn: number };
    held[scope] = {
      token: data.token,
      expiresAt: Date.now() + Math.max(0, data.expiresIn * 1000),
    };
    return data.token;
  } catch {
    held[scope] = null;
    return null;
  }
}

export async function endSession(scope: AuthScope = "user"): Promise<void> {
  clearSession(scope);
  try {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ scope }),
    });
  } catch {
    // Cookie is cleared server-side on the next successful call; ignore.
  }
}

export async function endAllSessions(scope: AuthScope = "user"): Promise<void> {
  const token = await getAccessToken(scope);
  if (token) {
    await fetch(`${API}/auth/logout-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    }).catch(() => undefined);
  }
  clearSession(scope);
}

/**
 * Runs an authenticated request and retries once after a 401, so an access
 * token that expired mid-session is replaced without the user noticing.
 */
export async function authedFetch(
  path: string,
  init: RequestInit = {},
  scope: AuthScope = "user",
): Promise<Response> {
  const send = async (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
  };

  let res = await send(await getAccessToken(scope));
  if (res.status === 401) {
    clearSession(scope);
    const fresh = await getAccessToken(scope);
    if (fresh) res = await send(fresh);
  }
  return res;
}
