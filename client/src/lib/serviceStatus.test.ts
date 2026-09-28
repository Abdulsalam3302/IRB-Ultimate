import { afterEach, describe, expect, it, vi } from "vitest";

describe("service status signal", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it("enters maintenance on 503 and clears on the next successful response", async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    vi.stubGlobal("CustomEvent", class<T> extends Event { detail: T; constructor(type: string, init: { detail: T }) { super(type); this.detail = init.detail; } });
    const status = await import("./serviceStatus");
    const seen: string[] = [];
    status.onServiceState(state => seen.push(state));
    status.observeApiResponse(new Response(null, { status: 503 }));
    expect(status.getServiceState()).toBe("online");
    const maintenance = () => new Response(null, { status: 503, headers: { "X-Service-State": "maintenance" } });
    status.observeApiResponse(maintenance());
    status.observeApiResponse(maintenance());
    expect(status.getServiceState()).toBe("maintenance");
    status.observeApiResponse(new Response(null, { status: 404 }));
    expect(status.getServiceState()).toBe("maintenance");
    status.observeApiResponse(new Response("{}", { status: 200 }));
    expect(status.getServiceState()).toBe("online");
    expect(seen).toEqual(["maintenance", "online"]);
  });
});
