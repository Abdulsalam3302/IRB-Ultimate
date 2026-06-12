import { describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({
  ENV: {
    isProduction: true,
    allowedOrigins: [
      "https://irb-saudi-arabia.vercel.app",
      "https://irb-saudi-arabia-*-researcher-os.vercel.app",
    ],
    supabaseUrl: "",
  },
}));

import { clientIpKey, isOriginAllowed } from "./_core/security";

type HeaderMap = Record<string, string | undefined>;

function fakeReq(opts: {
  method?: string;
  headers?: HeaderMap;
  host?: string;
  protocol?: string;
  ip?: string;
}) {
  const headers: HeaderMap = { ...opts.headers };
  return {
    method: opts.method ?? "POST",
    headers,
    protocol: opts.protocol ?? "https",
    ip: opts.ip ?? "203.0.113.7",
    socket: { remoteAddress: opts.ip ?? "203.0.113.7" },
    get(name: string) {
      if (name.toLowerCase() === "host") return opts.host ?? "api.example.com";
      return headers[name.toLowerCase()];
    },
  } as never;
}

describe("isOriginAllowed", () => {
  it("allows GET regardless of origin", () => {
    expect(
      isOriginAllowed(fakeReq({ method: "GET", headers: { origin: "https://evil.example" } }))
    ).toBe(true);
  });

  it("allows the exact allow-listed origin", () => {
    expect(
      isOriginAllowed(
        fakeReq({ headers: { origin: "https://irb-saudi-arabia.vercel.app" } })
      )
    ).toBe(true);
  });

  it("allows Vercel preview URLs via wildcard entry", () => {
    expect(
      isOriginAllowed(
        fakeReq({
          headers: { origin: "https://irb-saudi-arabia-jsfoi96jg-researcher-os.vercel.app" },
        })
      )
    ).toBe(true);
  });

  it("wildcard cannot cross a dot boundary", () => {
    expect(
      isOriginAllowed(
        fakeReq({
          headers: { origin: "https://irb-saudi-arabia-x.evil.com-researcher-os.vercel.app" },
        })
      )
    ).toBe(false);
  });

  it("allows proxied same-origin via X-Forwarded-Host (Vercel rewrite)", () => {
    expect(
      isOriginAllowed(
        fakeReq({
          host: "irb-ultimate-production.up.railway.app",
          headers: {
            origin: "https://some-new-alias.vercel.app",
            "x-forwarded-host": "some-new-alias.vercel.app",
            "x-forwarded-proto": "https",
          },
        })
      )
    ).toBe(true);
  });

  it("rejects cross-site origins that do not match the addressed host", () => {
    expect(
      isOriginAllowed(
        fakeReq({
          host: "irb-ultimate-production.up.railway.app",
          headers: {
            origin: "https://evil.example",
            "x-forwarded-host": "irb-saudi-arabia-abc123-researcher-os.vercel.app",
            "x-forwarded-proto": "https",
          },
        })
      )
    ).toBe(false);
  });

  it("rejects no-origin POSTs from non-loopback", () => {
    expect(isOriginAllowed(fakeReq({ headers: {} }))).toBe(false);
  });

  it("allows no-origin POSTs from loopback (dev tools)", () => {
    expect(isOriginAllowed(fakeReq({ headers: {}, ip: "127.0.0.1" }))).toBe(true);
  });
});

describe("clientIpKey", () => {
  it("uses the leftmost X-Forwarded-For entry", () => {
    expect(
      clientIpKey(fakeReq({ headers: { "x-forwarded-for": "198.51.100.4, 76.76.21.21" } }))
    ).toBe("198.51.100.4");
  });

  it("falls back to req.ip without the header", () => {
    expect(clientIpKey(fakeReq({ headers: {}, ip: "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("ignores malformed forwarded values", () => {
    expect(
      clientIpKey(fakeReq({ headers: { "x-forwarded-for": "<script>alert(1)</script>" }, ip: "203.0.113.9" }))
    ).toBe("203.0.113.9");
  });
});
