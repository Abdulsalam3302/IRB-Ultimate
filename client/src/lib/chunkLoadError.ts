/** Browsers report network/stale-deployment module failures differently. */
export function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i.test(
      error.message
    )
  );
}
