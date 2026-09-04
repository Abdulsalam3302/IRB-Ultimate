import { describe, expect, it } from "vitest";
import { friendlyChatSendError, isMissingChatProcedure } from "@shared/chatErrors";

describe("chat send error copy", () => {
  it("detects the live missing-procedure toast string", () => {
    expect(
      isMissingChatProcedure('No procedure found on path "chatApplication.sendMessage"'),
    ).toBe(true);
    expect(isMissingChatProcedure("network timeout")).toBe(false);
  });

  it("never returns the raw missing-procedure string", () => {
    const en = friendlyChatSendError(false);
    const ar = friendlyChatSendError(true);
    expect(en.toLowerCase()).not.toContain("no procedure found");
    expect(en).toContain("Could not send that message");
    expect(ar).toContain("تعذر");
  });
});
