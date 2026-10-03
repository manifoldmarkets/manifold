// Write to a Map used as a per-process L1 cache of timestamped entries, keeping
// it bounded. Entries older than ttlMs are never read again (callers recompute
// on a stale hit), so they are pure memory: evict them, then the oldest entries
// while the map is still over maxEntries.
//
// Deleting before setting moves a rewritten key to the back, so iteration order
// is write order and the stalest entries sit at the front. Eviction can then
// stop at the first entry it keeps instead of scanning the whole map.
export const setBoundedCacheEntry = <T extends { lastUpdated: number }>(
  cache: Map<string, T>,
  key: string,
  entry: T,
  options: { ttlMs: number; maxEntries: number },
  now = Date.now()
) => {
  const { ttlMs, maxEntries } = options
  cache.delete(key)
  cache.set(key, entry)
  for (const [oldestKey, oldest] of cache) {
    const expired = oldest.lastUpdated <= now - ttlMs
    if (!expired && cache.size <= maxEntries) break
    cache.delete(oldestKey)
  }
}
