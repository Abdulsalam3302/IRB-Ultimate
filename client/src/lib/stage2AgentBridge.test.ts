import { describe, expect, it, vi } from "vitest";
import { stage2Values } from "@shared/stage2Fields";
import {
  registerStage2Editor,
  requestStage2Editor,
  hasActiveStage2Editor,
  withStage2Submission,
} from "./stage2AgentBridge";
function fixture() {
  let fields = stage2Values({ methodology: "current typing" });
  const save = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn(values => {
    fields = { ...fields, ...values };
  });
  const setSubmissionLocked = vi.fn();
  const cleanup = registerStage2Editor({
    applicationId: 7,
    userId: 8,
    read: () => ({ applicationId: 7, fields, saveStatus: "saved" }),
    update,
    save,
    setSubmissionLocked,
  });
  return { cleanup, save, update, setSubmissionLocked };
}
describe("active Stage2 editor tool boundary", () => {
  it("applies fields to the active editor and awaits its ordered save", async () => {
    const f = fixture();
    try {
      const result = await requestStage2Editor({
        applicationId: 7,
        userId: 8,
        action: "update",
        fields: { riskAssessment: "documented risks" },
      });
      expect(result.fields).toMatchObject({
        methodology: "current typing",
        riskAssessment: "documented risks",
      });
      expect(f.save).toHaveBeenCalledOnce();
    } finally {
      f.cleanup();
    }
  });
  it.each([
    { methodology: 12 },
    { unknown: "value" },
    { methodology: "x".repeat(20_001) },
    {},
    null,
  ])("rejects invalid tool updates without writes", async fields => {
    const f = fixture();
    try {
      await expect(
        requestStage2Editor({
          applicationId: 7,
          userId: 8,
          action: "update",
          fields: fields as never,
        })
      ).rejects.toThrow("INVALID_STAGE2_FIELDS");
      expect(f.update).not.toHaveBeenCalled();
      expect(f.save).not.toHaveBeenCalled();
    } finally {
      f.cleanup();
    }
  });
  it("does not expose an editor to a different account or application", async () => {
    const f = fixture();
    try {
      expect(hasActiveStage2Editor(7, 9)).toBe(false);
      await expect(
        requestStage2Editor({ applicationId: 7, userId: 9, action: "read" })
      ).rejects.toThrow("NO_ACTIVE_STAGE2_EDITOR");
      await expect(
        requestStage2Editor({ applicationId: 99, userId: 8, action: "save" })
      ).rejects.toThrow("NO_ACTIVE_STAGE2_EDITOR");
    } finally {
      f.cleanup();
    }
  });
  it("rejects cancelled mutations and tears down access on unmount", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestStage2Editor({
        applicationId: 7,
        userId: 8,
        action: "update",
        fields: { methodology: "do not apply" },
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(f.update).not.toHaveBeenCalled();
    f.cleanup();
    expect(hasActiveStage2Editor(7, 8)).toBe(false);
  });
});

describe("submission editor lease", () => {
  it("locks before save and rejects editing or duplicate submission until the callback finishes", async () => {
    const f = fixture();
    let finish!: () => void;
    const done = new Promise<void>(resolve => {
      finish = resolve;
    });
    const submit = vi.fn(() => done);
    try {
      const pending = withStage2Submission(
        { applicationId: 7, userId: 8 },
        submit
      );
      expect(f.setSubmissionLocked).toHaveBeenCalledExactlyOnceWith(true);
      await Promise.resolve();
      expect(submit).toHaveBeenCalledOnce();
      await expect(
        requestStage2Editor({
          applicationId: 7,
          userId: 8,
          action: "update",
          fields: { methodology: "late write" },
        })
      ).rejects.toThrow("EDITOR_SUBMISSION_IN_PROGRESS");
      await expect(
        withStage2Submission({ applicationId: 7, userId: 8 }, submit)
      ).rejects.toThrow("EDITOR_SUBMISSION_IN_PROGRESS");
      expect(f.update).not.toHaveBeenCalled();
      finish();
      await pending;
      expect(f.setSubmissionLocked.mock.calls).toEqual([[true], [false]]);
    } finally {
      f.cleanup();
    }
  });
  it("does not submit a failed save and unlocks the draft for correction", async () => {
    const f = fixture();
    f.save.mockRejectedValueOnce(new Error("offline"));
    const submit = vi.fn();
    try {
      await expect(
        withStage2Submission({ applicationId: 7, userId: 8 }, submit)
      ).rejects.toThrow("offline");
      expect(submit).not.toHaveBeenCalled();
      expect(f.setSubmissionLocked).toHaveBeenLastCalledWith(false);
    } finally {
      f.cleanup();
    }
  });
  it("releases the editor after a failed submission without retaining a mutation lock", async () => {
    const f = fixture();
    try {
      await expect(
        withStage2Submission({ applicationId: 7, userId: 8 }, async () => {
          throw new Error("submission failed");
        })
      ).rejects.toThrow("submission failed");
      await requestStage2Editor({
        applicationId: 7,
        userId: 8,
        action: "update",
        fields: { methodology: "retry draft" },
      });
      expect(f.update).toHaveBeenCalledOnce();
      expect(f.setSubmissionLocked).toHaveBeenLastCalledWith(false);
    } finally {
      f.cleanup();
    }
  });
});
