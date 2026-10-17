import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunkLoadError";

describe("module load error presentation", () => {
  it.each([
    "Failed to fetch dynamically imported module: /assets/page.js",
    "Importing a module script failed.",
    "error loading dynamically imported module: /assets/page.js",
    "Unable to preload CSS for /assets/page.css",
  ])("recognizes browser module fetch failure: %s", message => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("does not classify arbitrary strings or unrelated errors as chunk failures", () => {
    expect(
      isChunkLoadError("Failed to fetch dynamically imported module")
    ).toBe(false);
    expect(isChunkLoadError(new Error("Failed to fetch"))).toBe(false);
  });
});
