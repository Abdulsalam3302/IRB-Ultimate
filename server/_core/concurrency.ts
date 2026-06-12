/**
 * Tiny FIFO semaphore — bounds how many expensive operations run at once.
 *
 * Used to cap concurrent headless-Chromium PDF renders: each render holds a
 * full browser page, and the export endpoints are reachable without auth, so
 * without a ceiling a burst of requests would fork-bomb the box into OOM.
 * Requests beyond the limit queue (and the route's own timeout bounds the
 * wait) rather than all launching at once.
 */
export class Semaphore {
  private readonly max: number;
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = Math.max(1, max);
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => this.queue.push(resolve));
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) {
      this.active += 1;
      next();
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Shared across every Playwright render path (resource templates AND
// certificates) so the global Chromium page count is bounded regardless of
// which route is hit. Tunable via env for bigger instances.
const PDF_MAX = parseInt(process.env.PDF_MAX_CONCURRENCY ?? "2", 10);
export const pdfSemaphore = new Semaphore(Number.isFinite(PDF_MAX) ? PDF_MAX : 2);
