/**
 * Tiny FIFO semaphore — bounds how many expensive operations run at once.
 *
 * Used to cap concurrent headless-Chromium PDF renders: each render holds a
 * full browser page, and the export endpoints are reachable without auth, so
 * without a ceiling a burst of requests would fork-bomb the box into OOM.
 * Requests beyond the limit queue (and the route's own timeout bounds the
 * wait) rather than all launching at once.
 */
export class CapacityError extends Error {
  constructor() { super("Service is busy. Please try again shortly."); this.name = "CapacityError"; }
}

export class Semaphore {
  private readonly max: number;
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(max: number, private readonly maxQueue = 16, private readonly waitMs = 5000) {
    this.max = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 1;
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.queue.length >= this.maxQueue) return Promise.reject(new CapacityError());
    return new Promise<void>((resolve, reject) => {
      const grant = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const at = this.queue.indexOf(grant);
        if (at >= 0) this.queue.splice(at, 1);
        reject(new CapacityError());
      }, this.waitMs);
      this.queue.push(grant);
    });
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
const PDF_MAX = parseInt(process.env.PDF_MAX_CONCURRENCY ?? "1", 10);
export const pdfSemaphore = new Semaphore(Number.isFinite(PDF_MAX) ? Math.min(PDF_MAX, 4) : 1);
