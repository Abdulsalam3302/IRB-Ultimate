import { PUBLIC_PATHS } from "@shared/seo";

/** Paths are controlled names, never identifiers, arbitrary URLs, or search strings. */
export function analyticsPath(path: string): string | null {
  const bare = path.split(/[?#]/, 1)[0];
  return bare !== "/verify" && PUBLIC_PATHS.includes(bare) ? bare : null;
}
