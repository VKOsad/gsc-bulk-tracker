// Small in-memory TTL cache for region searches. Region data is global (not per-user),
// so we key by search + country. Keeps the region autocomplete snappy and reduces
// Topvisor calls. Debounce lives on the client; this is the server-side layer.

import type { MappedRegion } from "./types";

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; data: MappedRegion[] }>();

function keyOf(search: string, countryCode?: string): string {
  return `${(countryCode ?? "").toLowerCase()}::${search.trim().toLowerCase()}`;
}

export function getCachedRegions(search: string, countryCode?: string): MappedRegion[] | null {
  const hit = cache.get(keyOf(search, countryCode));
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(keyOf(search, countryCode));
    return null;
  }
  return hit.data;
}

export function setCachedRegions(search: string, countryCode: string | undefined, data: MappedRegion[]): void {
  if (cache.size >= MAX_ENTRIES) {
    // Drop the oldest entry (Map preserves insertion order).
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(keyOf(search, countryCode), { at: Date.now(), data });
}
