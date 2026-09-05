import { afterEach, describe, expect, it, vi } from "vitest";
const environment = vi.hoisted(() => ({ isProduction: true, ownerOpenId: "sb:appointed-owner" }));
vi.mock("./_core/env", () => ({ ENV: environment }));
import { assertStaffMfa, staffMfaRequired } from "./_core/staffAuth";
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
  it("exempts only the boot-configured owner who still holds the admin role", () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    const owner = { openId: "sb:appointed-owner", role: "admin", authLevel: "aal1" };
    expect(staffMfaRequired(owner)).toBe(false);
    expect(() => assertStaffMfa(owner)).not.toThrow();
    expect(() => assertStaffMfa({ openId: owner.openId, role: owner.role })).not.toThrow();
    for (const account of [
      { ...owner, openId: "sb:secondary-admin" },
      { ...owner, role: "committee_member" },
      { ...owner, role: "user" },
      { ...owner, role: undefined },
      { ...owner, openId: undefined },
    ]) {
      expect(staffMfaRequired(account)).toBe(true);
      expect(() => assertStaffMfa(account)).toThrow(/multi-factor/);
    }
  });
  it("retains the configured policy for non-owner reviewers and allows their verified assurance", () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    const reviewer = { openId: "sb:reviewer", role: "committee_member", authLevel: "aal1" };
    expect(staffMfaRequired(reviewer)).toBe(true);
    expect(() => assertStaffMfa(reviewer)).toThrow(/multi-factor/);
    expect(() => assertStaffMfa({ ...reviewer, authLevel: "aal2" })).not.toThrow();
    environment.isProduction = false;
    expect(staffMfaRequired(reviewer)).toBe(false);
    expect(() => assertStaffMfa(reviewer)).not.toThrow();
  });
});
