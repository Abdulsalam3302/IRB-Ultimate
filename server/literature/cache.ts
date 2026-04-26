/**
 * Tiny in-memory LRU+TTL cache. Keeps the literature aggregator from
 * re-querying PubMed/CT.gov/S2/OpenAlex every time someone clicks the
 * related-work card or re-runs Stage 2. Single-process; swap for Redis
 * once you scale beyond one node.
 */

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class LruTtlCache<K, V> {
  private map = new Map<K, Entry<V>>();
  constructor(private maxSize: number, private ttlMs: number) {}

  get(key: K): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency by re-inserting
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    // evict oldest while we're over capacity
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
