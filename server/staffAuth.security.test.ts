import { afterEach, describe, expect, it, vi } from "vitest";
const environment = vi.hoisted(() => ({ isProduction: true }));
vi.mock("./_core/env", () => ({ ENV: environment }));
import { assertStaffMfa } from "./_core/staffAuth";
afterEach(() => { environment.isProduction = true; vi.unstubAllEnvs(); });
describe("staff assurance enforcement", () => {
  it("rejects missing and ordinary login assurance in production", () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    for (const user of [{}, { authLevel: "aal1" }, { authLevel: "arbitrary" }]) {
      expect(() => assertStaffMfa(user)).toThrow(/multi-factor/);
    }
    expect(() => assertStaffMfa({ authLevel: "aal2" })).not.toThrow();
  });
  it("supports only an explicit controlled-pilot override", () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "false");
    expect(() => assertStaffMfa({})).not.toThrow();
    vi.stubEnv("STAFF_MFA_REQUIRED", "0");
    expect(() => assertStaffMfa({})).toThrow();
  });
});
