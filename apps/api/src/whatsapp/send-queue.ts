import { Logger } from '@nestjs/common';
import {
  HumanConfig,
  isQuietNow,
  msUntilQuietEnds,
  randomBetween,
  sleep,
} from './human';
import type { SendLimits } from './send-limits';

/** Thrown when a send is refused by a cap or quiet window, not by WhatsApp. */
export class SendBlockedError extends Error {}

const MAX_TRACKED_CONTACTS = 1000;

/**
 * Serialises outbound sends so we never fire two at once, and spaces them out
 * with jittered gaps, daily caps and an optional quiet window.
 */
export class SendQueue {
  private readonly logger = new Logger(SendQueue.name);
  private chain: Promise<unknown> = Promise.resolve();
  private lastSendAt = 0;
  private readonly lastContactSendAt = new Map<string, number>();
  private depth = 0;

  constructor(
    private readonly cfg: HumanConfig,
    private readonly limits: SendLimits,
  ) {}

  pending(): number {
    return this.depth;
  }

  enqueue<T>(jid: string, task: () => Promise<T>): Promise<T> {
    this.depth += 1;
    const result = this.chain.then(
      () => this.execute(jid, task),
      () => this.execute(jid, task),
    );
    // Swallow rejections on the chain itself so one failure can't kill the queue.
    this.chain = result.catch(() => undefined);
    return result.finally(() => {
      this.depth -= 1;
    });
  }

  private async execute<T>(jid: string, task: () => Promise<T>): Promise<T> {
    const decision = await this.limits.check(jid);
    if (!decision.allowed) {
      throw new SendBlockedError(decision.reason ?? 'Send limit reached.');
    }

    await this.waitForQuietWindow();
    await this.waitForGaps(jid);

    const value = await task();

    const now = Date.now();
    this.lastSendAt = now;
    this.trackContact(jid, now);
    await this.limits.record(jid);
    return value;
  }

  private async waitForQuietWindow() {
    if (!this.cfg.enabled || !isQuietNow(this.cfg)) return;

    const wait = msUntilQuietEnds(this.cfg);
    if (wait > this.cfg.maxDeferMs) {
      throw new SendBlockedError(
        'Quiet hours are active and the wait is too long. This message was not sent.',
      );
    }
    this.logger.log(
      `Quiet hours active, holding message for ${Math.round(wait / 60_000)} min`,
    );
    await sleep(wait);
  }

  private async waitForGaps(jid: string) {
    if (!this.cfg.enabled) return;

    const now = Date.now();
    const sinceGlobal = now - this.lastSendAt;
    const globalGap = randomBetween(this.cfg.globalGapMinMs, this.cfg.globalGapMaxMs);

    const lastForContact = this.lastContactSendAt.get(jid) ?? 0;
    const sinceContact = now - lastForContact;
    const contactGap = randomBetween(
      this.cfg.contactGapMinMs,
      this.cfg.contactGapMaxMs,
    );

    const wait = Math.max(
      this.lastSendAt === 0 ? 0 : globalGap - sinceGlobal,
      lastForContact === 0 ? 0 : contactGap - sinceContact,
    );
    await sleep(wait);
  }

  private trackContact(jid: string, at: number) {
    this.lastContactSendAt.set(jid, at);
    if (this.lastContactSendAt.size > MAX_TRACKED_CONTACTS) {
      const oldest = this.lastContactSendAt.keys().next().value;
      if (oldest !== undefined) this.lastContactSendAt.delete(oldest);
    }
  }
}
