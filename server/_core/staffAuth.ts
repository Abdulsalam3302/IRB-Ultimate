import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

/** Assurance is signed into our session only after verifying the identity provider JWT. */
export function assertStaffMfa(user: { authLevel?: string }): void {
  if (ENV.isProduction && process.env.STAFF_MFA_REQUIRED !== "false" && user.authLevel !== "aal2") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff access requires multi-factor authentication. Complete verification in Profile using your institutional sign-in." });
  }
}
