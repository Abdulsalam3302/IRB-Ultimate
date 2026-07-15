/** First-visit disclaimer acknowledgment — bump VERSION to re-prompt all visitors. */
export const DISCLAIMER_ACK_KEY = "irb-disclaimer-ack";
export const DISCLAIMER_VERSION = "v1";

/** Paths reachable before the visitor acknowledges the open-beta disclaimer. */
export const DISCLAIMER_ALLOWED_PATHS = ["/disclaimer", "/policy"] as const;

export function isDisclaimerAllowedPath(path: string): boolean {
  const bare = path.split("?")[0] || "/";
  return (DISCLAIMER_ALLOWED_PATHS as readonly string[]).includes(bare);
}

export function hasAcknowledgedDisclaimer(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(DISCLAIMER_ACK_KEY) === DISCLAIMER_VERSION;
  } catch {
    return false;
  }
}

export function acknowledgeDisclaimer(): void {
  try {
    localStorage.setItem(DISCLAIMER_ACK_KEY, DISCLAIMER_VERSION);
  } catch {
    // private mode / quota — gate will reappear next visit
  }
}
