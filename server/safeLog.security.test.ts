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

it("keeps fixed driver diagnostics so outages can be attributed without leaking provider text", () => {
  const refused = Object.assign(new Error("connect ECONNREFUSED 10.0.0.8:4000 private-host"), { code: "ECONNREFUSED", errno: -111, sql: "Private SQL" });
  expect(safeLogError(refused)).toBe("Error code=ECONNREFUSED errno=-111");
  const denied = Object.assign(new Error("Access denied for user 'secret'@'host'"), { code: "ER_ACCESS_DENIED_ERROR", errno: 1045, sqlState: "28000" });
  expect(safeLogError(denied)).toBe("Error code=ER_ACCESS_DENIED_ERROR errno=1045 sqlState=28000");
  const quota = Object.assign(new Error("Due to the usage quota being exhausted, access to the cluster has been restricted"), { code: "ER_UNKNOWN_ERROR", errno: 1105, sqlState: "HY000" });
  expect(safeLogError(quota)).toBe("Error code=ER_UNKNOWN_ERROR errno=1105 sqlState=HY000 hint=database_quota_exhausted");
  const aggregate = new AggregateError([Object.assign(new Error("private"), { code: "ETIMEDOUT" })], "private");
  expect(safeLogError(aggregate)).toBe("AggregateError code=ETIMEDOUT");
});

it("rejects attacker-shaped codes and SQL states", () => {
  const error = Object.assign(new Error("x"), { code: "Private participant name", sqlState: "'; DROP", errno: "1045" });
  expect(safeLogError(error)).toBe("Error");
  expect(safeLogError(Object.assign(new Error("x"), { code: "PARTICIPANT_JANE_DOE" }))).toBe("Error");
});
