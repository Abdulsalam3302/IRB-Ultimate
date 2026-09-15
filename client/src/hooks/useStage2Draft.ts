import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Stage2Values } from "@shared/stage2Fields";
import { createDraftSaver, type DraftSaveStatus } from "@/lib/draftSaver";

export type Stage2Draft = { fields: Stage2Values; rejectionFileUrl: string };
/** Unsaved recovery uses the existing in-memory research cache, cleared on logout/account closure. */
export function useStage2Draft(
  userId: number,
  applicationId: number,
  initial: Stage2Draft,
  save: (draft: Stage2Draft) => Promise<unknown>
) {
  const cache = useQueryClient();
  const key = ["stage2-unsaved", userId, applicationId] as const;
  const [value, setValue] = useState(
    () => cache.getQueryData<Stage2Draft>(key) ?? initial
  );
  const latest = useRef(value);
  const saveFn = useRef(save);
  saveFn.current = save;
  const mounted = useRef(true);
  const [status, setStatus] = useState<DraftSaveStatus>("saved");
  const statusRef = useRef<DraftSaveStatus>("saved");
  const controller = useRef<ReturnType<
    typeof createDraftSaver<Stage2Draft>
  > | null>(null);
  if (!controller.current)
    controller.current = createDraftSaver(
      initial,
      draft => saveFn.current(draft),
      next => {
        statusRef.current = next;
        if (mounted.current) setStatus(next);
        if (
          next === "saved" &&
          JSON.stringify(cache.getQueryData(key)) ===
            JSON.stringify(controller.current?.getCurrent())
        )
          cache.removeQueries({ queryKey: key, exact: true });
      }
    );
  const update = (
    next: Stage2Draft | ((previous: Stage2Draft) => Stage2Draft)
  ) => {
    const resolved = typeof next === "function" ? next(latest.current) : next;
    latest.current = resolved;
    setValue(resolved);
    cache.setQueryDefaults(key, { gcTime: Infinity });
    cache.setQueryData(key, resolved);
    controller.current!.update(resolved);
  };
  useEffect(() => {
    mounted.current = true;
    controller.current!.update(latest.current);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!controller.current!.isDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
      controller.current!.stop();
      // A browser history traversal cannot await React routing. Drain its same
      // scoped queue; failed edits remain in the auth-cleared cache for return.
      void controller.current!.flush().catch(() => {});
    };
  }, []);
  return {
    value,
    update,
    status,
    statusRef,
    latest,
    flush: () => controller.current!.flush(),
    isDirty: () => controller.current!.isDirty(),
  };
}
