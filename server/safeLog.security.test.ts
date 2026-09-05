import { afterEach, expect, it, vi } from "vitest";
const environment = vi.hoisted(() => ({ isProduction: true }));
vi.mock("./_core/env", () => ({ ENV: environment }));
import { safeLogError } from "./_core/safeLog";
afterEach(() => { environment.isProduction = true; });
it("never logs production SQL parameters, provider bodies or attacker-controlled error names", () => {
  const error = Object.assign(new Error("Private protocol or database credentials"), { sql: "Private SQL", parameters: ["Private participant"] });
  expect(safeLogError(error)).toBe("Error");
  error.name = "Private participant";
  expect(safeLogError(error)).toBe("Error");
  expect(safeLogError({ body: "Private provider response" })).toBe("Error");
  expect(safeLogError(new TypeError("Private protocol"))).toBe("TypeError");
});
