/** List tRPC procedure paths from a router (v10/v11 compatible). */
export function listTrpcProcedurePaths(router: unknown): string[] {
  const out = new Set<string>();
  const def = (router as { _def?: { procedures?: Record<string, unknown>; record?: Record<string, unknown> } })?._def;
  if (def?.procedures && typeof def.procedures === "object") {
    for (const key of Object.keys(def.procedures)) {
      if (key && !key.startsWith("_")) out.add(key);
    }
  }
  const walk = (node: unknown, prefix: string) => {
    const rec = (node as { _def?: { record?: Record<string, unknown>; procedure?: unknown } })?._def;
    if (!rec) return;
    if (rec.procedure) {
      if (prefix) out.add(prefix);
      return;
    }
    const children = rec.record ?? {};
    for (const [key, child] of Object.entries(children)) {
      walk(child, prefix ? `${prefix}.${key}` : key);
    }
  };
  walk(router, "");
  return Array.from(out).sort();
}
