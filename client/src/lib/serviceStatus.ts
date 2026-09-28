/** Tiny shared signal for "the API is briefly unavailable" (maintenance or restart). */
export type ServiceState = "online" | "maintenance";
const EVENT = "irb:service-state";
let current: ServiceState = "online";

export function getServiceState(): ServiceState {
  return current;
}

export function setServiceState(next: ServiceState) {
  if (next === current || typeof window === "undefined") return;
  current = next;
  window.dispatchEvent(new CustomEvent<ServiceState>(EVENT, { detail: next }));
}

export function onServiceState(listener: (state: ServiceState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => listener((event as CustomEvent<ServiceState>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Observe API responses: only the server's maintenance gate (503 + X-Service-State) shows the banner;
 * other 503s (for example a disabled optional feature) do not. Any successful answer clears it. */
export function observeApiResponse(response: Response) {
  if (response.status === 503 && response.headers.get("x-service-state") === "maintenance") setServiceState("maintenance");
  else if (response.ok) setServiceState("online");
}
