/**
 * Background loop that polls quickly while work exists and backs off when idle
 * or failing. Keeps a managed database's request budget for real traffic
 * instead of empty 5-second polls, while `wake()` gives new work an immediate
 * start (for example straight after an application is submitted).
 */
export interface AdaptivePoller {
  wake(): void;
  stop(): Promise<void>;
}

export interface AdaptivePollerOptions {
  /** Delay between runs while work keeps arriving. */
  minMs: number;
  /** Ceiling for idle or failure backoff. */
  maxMs: number;
  /** Returns true when the run did useful work. */
  run: () => Promise<boolean>;
  onError?: (error: unknown) => void;
  /** Start immediately (default) or after `minMs`. */
  immediate?: boolean;
}

export function startAdaptivePoller(options: AdaptivePollerOptions): AdaptivePoller {
  const minMs = Math.max(10, Math.floor(options.minMs));
  const maxMs = Math.max(minMs, Math.floor(options.maxMs));
  let delay = minMs;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let wakeRequested = false;

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, ms);
    timer.unref?.();
  };

  const tick = () => {
    timer = null;
    if (stopped || running) return;
    wakeRequested = false;
    running = options.run()
      .then(busy => { delay = busy ? minMs : Math.min(maxMs, delay * 2); })
      .catch(error => { delay = Math.min(maxMs, Math.max(minMs, delay) * 2); options.onError?.(error); })
      .finally(() => {
        running = null;
        if (wakeRequested) { delay = minMs; schedule(0); }
        else schedule(delay);
      });
  };

  if (options.immediate === false) schedule(minMs); else tick();

  return {
    wake() {
      if (stopped) return;
      delay = minMs;
      if (running) { wakeRequested = true; return; }
      schedule(0);
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await running;
    },
  };
}
