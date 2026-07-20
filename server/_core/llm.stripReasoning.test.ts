import { describe, expect, it } from "vitest";
import { safeJsonParse, stripReasoningTags } from "./llm";

describe("stripReasoningTags (MiniMax M3 / M2)", () => {
  it("removes <think> wrappers and leaves the answer", () => {
    const raw = `<think>\nplanning...\n</think>\nOK`;
    expect(stripReasoningTags(raw)).toBe("OK");
  });

  it("unwraps markdown JSON fences after thinking", () => {
    const raw = `<think>x</think>\n\`\`\`json\n{"score":90}\n\`\`\``;
    expect(stripReasoningTags(raw)).toBe('{"score":90}');
    expect(safeJsonParse(stripReasoningTags(raw))).toEqual({ score: 90 });
  });

  it("lets safeJsonParse carve JSON when prose remains", () => {
    const raw = `Here you go: {"passed":true,"score":88} thanks`;
    expect(safeJsonParse(raw)).toEqual({ passed: true, score: 88 });
  });
});
