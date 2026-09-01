import { describe, expect, it } from "vitest";
import { normalizeChatMessages } from "./chatApplication.service";

describe("normalizeChatMessages", () => {
  it("caps length and drops empty roles", () => {
    const out = normalizeChatMessages([
      { role: "user", content: "  hello  " },
      { role: "assistant", content: "" },
      { role: "user", content: "x".repeat(5000) },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.content).toBe("hello");
    expect(out[1]!.content.length).toBe(4000);
  });
});
