import type { AuthResponse } from "@zegbot/shared";
import { API_URL } from "./api";
import { clearRefreshToken, getRefreshToken, setRefreshToken } from "./token";

/**
 * Native clients cannot rely on cookies, so the refresh token is kept in
 * SecureStore and sent explicitly. The access token stays in memory.
 */
let accessToken: string | null = null;
let expiresAt = 0;
let inFlight: Promise<string | null> | null = null;

const SKEW_MS = 30_000;

export const NATIVE_HEADERS = { "x-zegbot-client": "native" } as const;

export async function storeSession(res: AuthResponse): Promise<void> {
  accessToken = res.token;
  expiresAt = Date.now() + Math.max(0, res.expiresIn * 1000);
  if (res.refreshToken) await setRefreshToken(res.refreshToken);
}

export async function clearStoredSession(): Promise<void> {
  accessToken = null;
  expiresAt = 0;
  inFlight = null;
  await clearRefreshToken();
}

/** Returns a valid access token, refreshing from SecureStore when needed. */
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && expiresAt - SKEW_MS > Date.now()) return accessToken;

  inFlight ??= refresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function refresh(): Promise<string | null> {
  const stored = await getRefreshToken();
  if (!stored) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...NATIVE_HEADERS },
      body: JSON.stringify({ refreshToken: stored }),
    });
    if (!res.ok) {
      // The server rejected it (expired, revoked, or reused) — force a login.
      await clearStoredSession();
      return null;
    }
    const data = (await res.json()) as {
      token: string;
      expiresIn: number;
      refreshToken?: string;
    };
    accessToken = data.token;
    expiresAt = Date.now() + Math.max(0, data.expiresIn * 1000);
    if (data.refreshToken) await setRefreshToken(data.refreshToken);
    return accessToken;
  } catch {
    // Offline: keep the stored refresh token so it works again later.
    return null;
  }
}

export async function endSession(): Promise<void> {
  const stored = await getRefreshToken();
  if (stored) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...NATIVE_HEADERS },
      body: JSON.stringify({ refreshToken: stored }),
    }).catch(() => undefined);
  }
  await clearStoredSession();
}

export async function endAllSessions(): Promise<void> {
  const token = await getAccessToken();
  if (token) {
    await fetch(`${API_URL}/auth/logout-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...NATIVE_HEADERS },
    }).catch(() => undefined);
  }
  await clearStoredSession();
}

/** Authenticated request that retries once after a 401 with a fresh token. */
export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = async (token: string | null) => {
    const headers = new Headers(init.headers);
    headers.set("x-zegbot-client", "native");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  };

  let res = await send(await getAccessToken());
  if (res.status === 401) {
    accessToken = null;
    expiresAt = 0;
    const fresh = await getAccessToken();
    if (fresh) res = await send(fresh);
  }
  return res;
}
