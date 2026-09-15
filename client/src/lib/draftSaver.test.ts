import { afterEach, describe, expect, it, vi } from "vitest";
import { createDraftSaver } from "./draftSaver";
afterEach(() => vi.useRealTimers());
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
describe("ordered draft persistence", () => {
  it("coalesces typing without writing an unchanged initial form", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const draft = createDraftSaver({ text: "saved" }, save, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
    draft.update({ text: "a" });
    await vi.advanceTimersByTimeAsync(500);
    draft.update({ text: "latest" });
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith({ text: "latest" });
    expect(draft.isDirty()).toBe(false);
  });
  it("serializes an explicit save behind an in-flight autosave and drains newer typing", async () => {
    vi.useFakeTimers();
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const draft = createDraftSaver({ text: "original" }, save, vi.fn());
    draft.update({ text: "first" });
    await vi.advanceTimersByTimeAsync(800);
    draft.update({ text: "latest while waiting" });
    const manual = draft.flush();
    const review = draft.flush();
    expect(review).toBe(manual);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve();
    await manual;
    expect(save.mock.calls.map(call => call[0])).toEqual([
      { text: "first" },
      { text: "latest while waiting" },
    ]);
    expect(draft.isDirty()).toBe(false);
  });
  it("retains unsaved values after failure and retries the latest snapshot", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const state = vi.fn();
    const draft = createDraftSaver({ text: "saved" }, save, state);
    draft.update({ text: "unsaved" });
    await expect(draft.flush()).rejects.toThrow("offline");
    expect(draft.isDirty()).toBe(true);
    expect(draft.getCurrent()).toEqual({ text: "unsaved" });
    expect(state).toHaveBeenLastCalledWith("error");
    draft.update({ text: "latest" });
    await draft.flush();
    expect(save).toHaveBeenLastCalledWith({ text: "latest" });
    expect(state).toHaveBeenLastCalledWith("saved");
  });
  it("does not let stale saved data overwrite a user reverting while a write is pending", async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(undefined);
    const draft = createDraftSaver({ text: "original" }, save, vi.fn());
    draft.update({ text: "changed" });
    const pending = draft.flush();
    await Promise.resolve();
    draft.update({ text: "original" });
    first.resolve();
    await pending;
    expect(save.mock.calls.map(call => call[0])).toEqual([
      { text: "changed" },
      { text: "original" },
    ]);
    expect(draft.getCurrent()).toEqual({ text: "original" });
    expect(draft.isDirty()).toBe(false);
  });
  it("can flush on navigation after cancelling a scheduled debounce", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const draft = createDraftSaver({ text: "" }, save, vi.fn());
    draft.update({ text: "navigation draft" });
    draft.stop();
    await draft.flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledExactlyOnceWith({ text: "navigation draft" });
  });
});
