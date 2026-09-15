export type DraftSaveStatus = "saved" | "unsaved" | "saving" | "error";
/** One write queue for automatic and explicit saves. Edits during a request are drained in order. */
export function createDraftSaver<T>(
  initial: T,
  save: (value: T) => Promise<unknown>,
  onStatus: (state: DraftSaveStatus) => void,
  delayMs = 800
) {
  let current = JSON.stringify(initial);
  let saved = current;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  const cancelTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const flush = (): Promise<void> => {
    cancelTimer();
    if (pending) return pending;
    if (current === saved) return Promise.resolve();
    const run = async () => {
      onStatus("saving");
      try {
        while (current !== saved) {
          const snapshot = current;
          await save(JSON.parse(snapshot) as T);
          saved = snapshot;
        }
        onStatus("saved");
      } catch (error) {
        onStatus("error");
        throw error;
      }
    };
    // Set the promise before invoking user code, including synchronous save errors.
    pending = Promise.resolve()
      .then(run)
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
  return {
    update(value: T) {
      const next = JSON.stringify(value);
      if (next === current) return;
      current = next;
      cancelTimer();
      if (!pending) onStatus(current === saved ? "saved" : "unsaved");
      if (current !== saved)
        timer = setTimeout(() => {
          timer = undefined;
          void flush().catch(() => {});
        }, delayMs);
    },
    flush,
    isDirty: () => current !== saved || Boolean(pending),
    getCurrent: () => JSON.parse(current) as T,
    stop: cancelTimer,
  };
}
