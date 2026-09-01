import { JsonStore } from '../common/json-store';
import type { HumanConfig } from './human';

interface DayCounters {
  sent: number;
  newContacts: number;
}

interface LimitsData {
  firstSeen: string;
  days: Record<string, DayCounters>;
  contacts: string[];
}

/**
 * Daily send allowance for a freshly linked number, by day since first use.
 * A brand new number blasting hundreds of messages is the clearest ban signal,
 * so the allowance ramps up instead of starting at the configured maximum.
 */
const WARMUP_TOTAL = [20, 40, 80, 150, 250, 400];
const WARMUP_NEW_CONTACTS = [5, 10, 20, 30, 50, 80];

const KEEP_DAYS = 14;
const MAX_CONTACTS = 5000;

export interface LimitDecision {
  allowed: boolean;
  reason?: string;
}

export interface LimitSnapshot {
  dayIndex: number;
  sentToday: number;
  newContactsToday: number;
  dailyCap: number;
  newContactCap: number;
  knownContacts: number;
}

export class SendLimits {
  private data: LimitsData | null = null;
  private loading: Promise<LimitsData> | null = null;

  constructor(
    private readonly store: JsonStore<LimitsData>,
    private readonly cfg: HumanConfig,
  ) {}

  async check(jid: string): Promise<LimitDecision> {
    const data = await this.load();
    const day = this.today(data);
    const isNew = !data.contacts.includes(jid);
    const caps = this.caps(data);

    if (day.sent >= caps.dailyCap) {
      return {
        allowed: false,
        reason: `Daily send limit reached (${day.sent}/${caps.dailyCap}). Try again tomorrow.`,
      };
    }
    if (isNew && day.newContacts >= caps.newContactCap) {
      return {
        allowed: false,
        reason: `Daily new-contact limit reached (${day.newContacts}/${caps.newContactCap}). Existing chats still work.`,
      };
    }
    return { allowed: true };
  }

  async record(jid: string): Promise<void> {
    const data = await this.load();
    const day = this.today(data);
    day.sent += 1;

    if (!data.contacts.includes(jid)) {
      day.newContacts += 1;
      data.contacts.push(jid);
      if (data.contacts.length > MAX_CONTACTS) {
        data.contacts.splice(0, data.contacts.length - MAX_CONTACTS);
      }
    }

    this.prune(data);
    await this.store.write(data);
  }

  async snapshot(): Promise<LimitSnapshot> {
    const data = await this.load();
    const day = this.today(data);
    const caps = this.caps(data);
    return {
      dayIndex: this.dayIndex(data) + 1,
      sentToday: day.sent,
      newContactsToday: day.newContacts,
      dailyCap: caps.dailyCap,
      newContactCap: caps.newContactCap,
      knownContacts: data.contacts.length,
    };
  }

  private caps(data: LimitsData): { dailyCap: number; newContactCap: number } {
    if (!this.cfg.warmupEnabled) {
      return {
        dailyCap: this.cfg.dailyCap,
        newContactCap: this.cfg.dailyNewContactCap,
      };
    }
    const i = this.dayIndex(data);
    const total = i < WARMUP_TOTAL.length ? WARMUP_TOTAL[i] : this.cfg.dailyCap;
    const fresh =
      i < WARMUP_NEW_CONTACTS.length
        ? WARMUP_NEW_CONTACTS[i]
        : this.cfg.dailyNewContactCap;
    return {
      dailyCap: Math.min(this.cfg.dailyCap, total),
      newContactCap: Math.min(this.cfg.dailyNewContactCap, fresh),
    };
  }

  private dayIndex(data: LimitsData): number {
    const first = new Date(data.firstSeen).getTime();
    if (!Number.isFinite(first)) return WARMUP_TOTAL.length;
    return Math.max(0, Math.floor((Date.now() - first) / 86_400_000));
  }

  private today(data: LimitsData): DayCounters {
    const key = dayKey();
    data.days[key] ??= { sent: 0, newContacts: 0 };
    return data.days[key];
  }

  private prune(data: LimitsData) {
    const keys = Object.keys(data.days).sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) {
      delete data.days[key];
    }
  }

  private load(): Promise<LimitsData> {
    if (this.data) return Promise.resolve(this.data);
    this.loading ??= this.store.read().then((stored) => {
      this.data = {
        firstSeen: stored?.firstSeen ?? new Date().toISOString(),
        days: stored?.days ?? {},
        contacts: stored?.contacts ?? [],
      };
      return this.data;
    });
    return this.loading;
  }
}

function dayKey(date = new Date()): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}
