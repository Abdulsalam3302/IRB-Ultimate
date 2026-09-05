import { afterEach, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { getRegistryStats, searchPublicRegistry } from "./db";
afterEach(() => { ENV.isProduction = false; vi.unstubAllEnvs(); });
it("blocks public registry enumeration before any production database read unless publication is explicitly enabled", async () => {
  ENV.isProduction = true;
  vi.stubEnv("PUBLIC_REGISTRY_ENABLED", "false");
  await expect(searchPublicRegistry({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  await expect(getRegistryStats()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
});
