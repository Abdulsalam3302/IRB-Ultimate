import { afterEach, describe, expect, it, vi } from "vitest";
import { startAdaptivePoller } from "./_core/adaptivePoller";

afterEach(() => { vi.useRealTimers(); });

describe("adaptive background polling", () => {
  it("backs off while idle, resets while busy, and wakes immediately", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    let busy = false;
    const poller = startAdaptivePoller({ minMs: 1000, maxMs: 8000, run: async () => { calls.push(Date.now()); return busy; } });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    // Idle: 2s, 4s, 8s, 8s…
    await vi.advanceTimersByTimeAsync(2000); expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(4000); expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(8000); expect(calls).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(8000); expect(calls).toHaveLength(5);
    busy = true;
    poller.wake();
    await vi.advanceTimersByTimeAsync(0); expect(calls).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(1000); expect(calls).toHaveLength(7);
    await poller.stop();
    await vi.advanceTimersByTimeAsync(60_000); expect(calls).toHaveLength(7);
  });

  it("backs off on failure without throwing and reports the error", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    let attempts = 0;
    const poller = startAdaptivePoller({ minMs: 1000, maxMs: 4000, onError, run: async () => { attempts++; throw new Error("down"); } });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(attempts).toBe(4);
    expect(onError).toHaveBeenCalledTimes(4);
    await poller.stop();
  });

  it("queues a wake that arrives during a run", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    let runs = 0;
    const poller = startAdaptivePoller({ minMs: 5000, maxMs: 60_000, run: () => { runs++; return runs === 1 ? new Promise<boolean>(resolve => { release = () => resolve(false); }) : Promise.resolve(false); } });
    await vi.advanceTimersByTimeAsync(0);
    poller.wake();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toBe(2);
    await poller.stop();
  });
});
