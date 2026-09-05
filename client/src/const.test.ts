import { afterEach, describe, expect, it, vi } from "vitest";
import { getLoginUrl } from "./const";

const config = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/supabase", () => ({
  get isSupabaseAuthEnabled() {
    return config.enabled;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  config.enabled = false;
});

function configure(enabled: boolean, portal: string) {
  config.enabled = enabled;
  vi.stubEnv("VITE_OAUTH_PORTAL_URL", portal);
  vi.stubGlobal("window", { location: { origin: "https://irb.example.test" } });
}

describe("login destination selection", () => {
  it("opens the account selector when no legacy portal is configured", () => {
    configure(false, "");
    expect(getLoginUrl("/profile")).toBe(
      "https://irb.example.test/auth?next=%2Fprofile"
    );
  });
  it("preserves the server nonce flow for an explicitly configured legacy portal", () => {
    configure(false, "https://legacy.example.test");
    expect(getLoginUrl("/dashboard")).toBe(
      "https://irb.example.test/api/oauth/start?next=%2Fdashboard"
    );
  });
  it("prefers the explicit account selector when institutional auth is available", () => {
    configure(true, "https://legacy.example.test");
    expect(getLoginUrl()).toBe("https://irb.example.test/auth");
  });
  it.each([
    "//attacker.example",
    "https://attacker.example",
    "/\\attacker.example",
  ])("does not embed an external redirect destination", value => {
    configure(true, "");
    expect(new URL(getLoginUrl(value)).searchParams.has("next")).toBe(false);
  });
});
