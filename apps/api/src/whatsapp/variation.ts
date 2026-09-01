/**
 * Picks one option per `{a|b|c}` group so the same template does not produce a
 * byte-identical message for every recipient. Innermost groups resolve first,
 * so nesting works.
 */
export function expandSpintax(text: string): string {
  const group = /\{([^{}]*\|[^{}]*)\}/;
  let out = text;
  for (let i = 0; i < 20 && group.test(out); i += 1) {
    out = out.replace(group, (_, body: string) => {
      const options = body.split('|');
      return options[Math.floor(Math.random() * options.length)] ?? '';
    });
  }
  return out;
}

/**
 * Counts how many distinct contacts received the exact same text recently.
 * Identical broadcasts are what recipients report as spam, so the caller warns
 * once the count crosses the configured threshold.
 */
export class DuplicateTracker {
  private readonly seen = new Map<string, { jids: Set<string>; at: number }>();

  constructor(
    private readonly windowMs = 60 * 60 * 1000,
    private readonly maxEntries = 200,
  ) {}

  /** Returns the number of distinct contacts that got this exact text. */
  track(text: string, jid: string): number {
    const key = text.trim().toLowerCase();
    if (key === '') return 0;

    this.prune();
    const entry = this.seen.get(key) ?? { jids: new Set<string>(), at: Date.now() };
    entry.jids.add(jid);
    entry.at = Date.now();
    this.seen.set(key, entry);
    return entry.jids.size;
  }

  private prune() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, entry] of this.seen) {
      if (entry.at < cutoff) this.seen.delete(key);
    }
    while (this.seen.size > this.maxEntries) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
  }
}
