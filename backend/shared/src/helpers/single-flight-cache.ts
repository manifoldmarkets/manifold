// Caches each key's result for ttlMs and shares one in-flight computation
// between concurrent callers of the same key. Failures are not cached. The
// cache is per process, so each API worker computes a key at most once per TTL.
export const createSingleFlightCache = <T>(props: {
  ttlMs: number
  maxEntries: number
}) => {
  const { ttlMs, maxEntries } = props
  const cached = new Map<string, { value: T; cachedAt: number }>()
  const inFlight = new Map<string, Promise<T>>()

  // Map iteration follows insertion order and every write re-inserts its key,
  // so the front of the map holds the oldest entries.
  const trim = () => {
    const now = Date.now()
    for (const [key, { cachedAt }] of cached) {
      if (now - cachedAt <= ttlMs && cached.size <= maxEntries) return
      cached.delete(key)
    }
  }

  const get = async (key: string, compute: () => Promise<T>) => {
    const hit = cached.get(key)
    if (hit && Date.now() - hit.cachedAt <= ttlMs) return hit.value

    const pending = inFlight.get(key)
    if (pending) return await pending

    const computation = compute()
      .then((value) => {
        cached.delete(key)
        cached.set(key, { value, cachedAt: Date.now() })
        trim()
        return value
      })
      .finally(() => inFlight.delete(key))
    inFlight.set(key, computation)
    return await computation
  }

  return { get }
}
