import { STAGE2_KEYS, type Stage2Values } from "@shared/stage2Keys";
import type { DraftSaveStatus } from "./draftSaver";
export type Stage2EditorResult = {
  applicationId: number;
  fields: Stage2Values;
  saveStatus: DraftSaveStatus;
};
type Editor = {
  applicationId: number;
  userId: number;
  read: () => Stage2EditorResult;
  update: (fields: Partial<Stage2Values>) => void;
  save: () => Promise<void>;
  setSubmissionLocked: (locked: boolean) => void;
};
let active: Editor | null = null;
let submissionLease: Editor | null = null;
export function registerStage2Editor(editor: Editor): () => void {
  active = editor;
  return () => {
    if (active === editor) active = null;
  };
}
export function hasActiveStage2Editor(
  applicationId: number,
  userId: number
): boolean {
  return active?.applicationId === applicationId && active.userId === userId;
}
export async function requestStage2Editor(input: {
  applicationId: number;
  userId: number;
  action: "read" | "update" | "save";
  fields?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Stage2EditorResult> {
  input.signal?.throwIfAborted();
  const editor = active;
  if (
    !editor ||
    editor.applicationId !== input.applicationId ||
    editor.userId !== input.userId
  )
    throw new Error("NO_ACTIVE_STAGE2_EDITOR");
  if (submissionLease === editor && input.action !== "read")
    throw new Error("EDITOR_SUBMISSION_IN_PROGRESS");
  if (!["read", "update", "save"].includes(input.action))
    throw new Error("INVALID_EDITOR_ACTION");
  if (input.action === "update") {
    if (
      !input.fields ||
      typeof input.fields !== "object" ||
      Array.isArray(input.fields) ||
      !Object.keys(input.fields).length ||
      Object.entries(input.fields).some(
        ([key, value]) =>
          !STAGE2_KEYS.includes(key as keyof Stage2Values) ||
          typeof value !== "string" ||
          value.length > 20_000
      )
    )
      throw new Error("INVALID_STAGE2_FIELDS");
    editor.update({ ...input.fields } as Partial<Stage2Values>);
  } else if (input.fields !== undefined)
    throw new Error("FIELDS_REQUIRE_UPDATE_ACTION");
  if (input.action !== "read") await editor.save();
  input.signal?.throwIfAborted();
  if (active !== editor) throw new Error("STAGE2_EDITOR_CHANGED");
  return editor.read();
}

/** Freeze the owned form before flushing; typing cannot race the submitted snapshot. */
export async function withStage2Submission<T>(
  input: { applicationId: number; userId: number; signal?: AbortSignal },
  submit: () => Promise<T>
): Promise<T> {
  input.signal?.throwIfAborted();
  const editor = active;
  if (
    !editor ||
    editor.applicationId !== input.applicationId ||
    editor.userId !== input.userId
  )
    return submit();
  if (submissionLease) throw new Error("EDITOR_SUBMISSION_IN_PROGRESS");
  editor.setSubmissionLocked(true);
  submissionLease = editor;
  try {
    await editor.save();
    input.signal?.throwIfAborted();
    if (active !== editor) throw new Error("STAGE2_EDITOR_CHANGED");
    return await submit();
  } finally {
    if (submissionLease === editor) submissionLease = null;
    editor.setSubmissionLocked(false);
  }
}
