import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthScope } from '@zegbot/shared';

/** Separate cookies so one browser can hold a user and an admin session at once. */
export const REFRESH_COOKIES: Record<AuthScope, string> = {
  user: 'zegbot_rt',
  admin: 'zegbot_admin_rt',
};

export function cookieName(scope: AuthScope | undefined): string {
  return REFRESH_COOKIES[scope === 'admin' ? 'admin' : 'user'];
}

function options(config: ConfigService, maxAgeMs: number): CookieOptions {
  // Secure requires HTTPS, which local http://zegbot.local does not have.
  const secure = (config.get<string>('COOKIE_SECURE') ?? '') === 'true';
  const domain = config.get<string>('COOKIE_DOMAIN') || undefined;
  return {
    httpOnly: true,
    secure,
    // Lax still sends the cookie on top-level navigation, which the email
    // verification and Stripe return links rely on.
    sameSite: secure ? 'none' : 'lax',
    domain,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setRefreshCookie(
  res: Response,
  config: ConfigService,
  scope: AuthScope,
  token: string,
  maxAgeMs: number,
) {
  res.cookie(cookieName(scope), token, options(config, maxAgeMs));
}

export function clearRefreshCookie(
  res: Response,
  config: ConfigService,
  scope: AuthScope,
) {
  const { maxAge: _maxAge, ...rest } = options(config, 0);
  res.clearCookie(cookieName(scope), rest);
}

export function readRefreshCookie(
  req: Request,
  scope: AuthScope | undefined,
): string | undefined {
  const jar = (req as Request & { cookies?: Record<string, string> }).cookies;
  return jar?.[cookieName(scope)];
}

/** Short label for the session list, e.g. "Chrome on Windows". */
export function deviceLabel(req: Request): string {
  const ua = req.headers['user-agent'];
  return (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 255) ?? 'Unknown device';
}
