import { ENV } from "./env";

// One authority snapshot for owner routes and the owner's MFA policy. A
// mid-process environment mutation cannot reassign either privilege.
const BOOT_OWNER_OPEN_ID = ENV.ownerOpenId;

export type OwnerIdentity = {
  role?: string;
  openId?: string;
};

/** Only the explicitly appointed admin subject is the platform owner.
 * Contact email, provider metadata and matching names never confer authority.
 */
export function isPlatformOwner(user: OwnerIdentity | null | undefined): boolean {
  return Boolean(BOOT_OWNER_OPEN_ID && user?.role === "admin" && user.openId === BOOT_OWNER_OPEN_ID);
}
