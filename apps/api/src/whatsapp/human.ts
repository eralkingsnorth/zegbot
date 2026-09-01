import type { ConfigService } from '@nestjs/config';

export interface QuietHours {
  start: number;
  end: number;
}

export interface HumanConfig {
  enabled: boolean;
  readDelayMinMs: number;
  readDelayMaxMs: number;
  typingCharsPerSecond: number;
  typingMinMs: number;
  typingMaxMs: number;
  attachmentGapMinMs: number;
  attachmentGapMaxMs: number;
  globalGapMinMs: number;
  globalGapMaxMs: number;
  contactGapMinMs: number;
  contactGapMaxMs: number;
  dailyCap: number;
  dailyNewContactCap: number;
  warmupEnabled: boolean;
  quietHours: QuietHours | null;
  maxDeferMs: number;
  duplicateWarnThreshold: number;
}

const num = (config: ConfigService, key: string, fallback: number): number => {
  const raw = config.get<string | number>(key);
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
};

const bool = (config: ConfigService, key: string, fallback: boolean): boolean => {
  const raw = config.get<string | boolean>(key);
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
};

/** Parses "23-7" into a wrapping quiet window. Empty or invalid disables it. */
export function parseQuietHours(raw: unknown): QuietHours | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const match = raw.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 23 || start === end) return null;
  return { start, end };
}

export function readHumanConfig(config: ConfigService): HumanConfig {
  const cfg: HumanConfig = {
    enabled: bool(config, 'HUMAN_MODE', true),
    readDelayMinMs: num(config, 'HUMAN_READ_DELAY_MIN_MS', 900),
    readDelayMaxMs: num(config, 'HUMAN_READ_DELAY_MAX_MS', 2600),
    typingCharsPerSecond: num(config, 'HUMAN_TYPING_CPS', 10),
    typingMinMs: num(config, 'HUMAN_TYPING_MIN_MS', 1200),
    typingMaxMs: num(config, 'HUMAN_TYPING_MAX_MS', 12000),
    attachmentGapMinMs: num(config, 'HUMAN_ATTACHMENT_GAP_MIN_MS', 1200),
    attachmentGapMaxMs: num(config, 'HUMAN_ATTACHMENT_GAP_MAX_MS', 3600),
    globalGapMinMs: num(config, 'HUMAN_SEND_GAP_MIN_MS', 2500),
    globalGapMaxMs: num(config, 'HUMAN_SEND_GAP_MAX_MS', 7000),
    contactGapMinMs: num(config, 'HUMAN_CONTACT_GAP_MIN_MS', 1200),
    contactGapMaxMs: num(config, 'HUMAN_CONTACT_GAP_MAX_MS', 3000),
    dailyCap: num(config, 'HUMAN_DAILY_CAP', 500),
    dailyNewContactCap: num(config, 'HUMAN_DAILY_NEW_CONTACT_CAP', 100),
    warmupEnabled: bool(config, 'HUMAN_WARMUP', true),
    quietHours: parseQuietHours(config.get('HUMAN_QUIET_HOURS')),
    maxDeferMs: num(config, 'HUMAN_MAX_DEFER_MS', 12 * 60 * 60 * 1000),
    duplicateWarnThreshold: num(config, 'HUMAN_DUPLICATE_WARN_THRESHOLD', 5),
  };

  // A max below its min would make the ranges collapse or throw off the jitter.
  if (cfg.readDelayMaxMs < cfg.readDelayMinMs) cfg.readDelayMaxMs = cfg.readDelayMinMs;
  if (cfg.typingMaxMs < cfg.typingMinMs) cfg.typingMaxMs = cfg.typingMinMs;
  if (cfg.attachmentGapMaxMs < cfg.attachmentGapMinMs) {
    cfg.attachmentGapMaxMs = cfg.attachmentGapMinMs;
  }
  if (cfg.globalGapMaxMs < cfg.globalGapMinMs) cfg.globalGapMaxMs = cfg.globalGapMinMs;
  if (cfg.contactGapMaxMs < cfg.contactGapMinMs) {
    cfg.contactGapMaxMs = cfg.contactGapMinMs;
  }
  if (cfg.typingCharsPerSecond <= 0) cfg.typingCharsPerSecond = 10;

  return cfg;
}

export function isQuietNow(cfg: HumanConfig, now = new Date()): boolean {
  const q = cfg.quietHours;
  if (!q) return false;
  const h = now.getHours();
  return q.start < q.end ? h >= q.start && h < q.end : h >= q.start || h < q.end;
}

/** Milliseconds until the quiet window ends, or 0 when already outside it. */
export function msUntilQuietEnds(cfg: HumanConfig, now = new Date()): number {
  const q = cfg.quietHours;
  if (!q || !isQuietNow(cfg, now)) return 0;
  const end = new Date(now);
  end.setHours(q.end, 0, 0, 0);
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
  return end.getTime() - now.getTime();
}

export const randomBetween = (min: number, max: number): number =>
  max <= min ? min : Math.round(min + Math.random() * (max - min));

export const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

/** Time a person would plausibly spend typing `text`, jittered by +/-20%. */
export function typingDurationMs(text: string, cfg: HumanConfig): number {
  const chars = text.trim().length;
  if (chars === 0) return cfg.typingMinMs;
  const base = (chars / cfg.typingCharsPerSecond) * 1000;
  const jittered = base * (0.8 + Math.random() * 0.4);
  return Math.round(Math.min(Math.max(jittered, cfg.typingMinMs), cfg.typingMaxMs));
}

/** Exponential backoff with jitter so reconnects don't hammer the server. */
export function reconnectDelayMs(attempt: number): number {
  const base = Math.min(2000 * 2 ** Math.max(0, attempt - 1), 5 * 60_000);
  return Math.round(base * (0.7 + Math.random() * 0.6));
}
