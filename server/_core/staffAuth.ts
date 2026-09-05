import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { isPlatformOwner, type OwnerIdentity } from "./ownerAuthority";

/** The appointed owner is exempt; every other staff identity retains the
 * configured MFA policy. This is also the authoritative policy for auth.me.
 */
export function staffMfaRequired(user: OwnerIdentity | null | undefined): boolean {
  return ENV.isProduction && process.env.STAFF_MFA_REQUIRED !== "false" && !isPlatformOwner(user);
}

/** Assurance is signed into our session only after verifying the identity provider JWT. */
export function assertStaffMfa(user: OwnerIdentity & { authLevel?: string }): void {
  if (staffMfaRequired(user) && user.authLevel !== "aal2") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Complete multi-factor verification to continue to staff tools." });
  }
}
