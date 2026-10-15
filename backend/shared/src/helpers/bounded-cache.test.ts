import { setBoundedCacheEntry } from './bounded-cache'

type Entry = { lastUpdated: number }

const NOW = 1_000_000
const TTL_MS = 1_000

const set = (
  cache: Map<string, Entry>,
  key: string,
  lastUpdated: number,
  maxEntries = 10
) =>
  setBoundedCacheEntry(
    cache,
    key,
    { lastUpdated },
    { ttlMs: TTL_MS, maxEntries },
    NOW
  )

describe('setBoundedCacheEntry', () => {
  it('stores fresh entries while under the cap', () => {
    const cache = new Map<string, Entry>()
    set(cache, 'a', NOW - 10)
    set(cache, 'b', NOW - 5)
    set(cache, 'c', NOW)
    expect([...cache.keys()]).toEqual(['a', 'b', 'c'])
  })

  it('evicts expired entries from the front on write', () => {
    const cache = new Map<string, Entry>([
      ['old1', { lastUpdated: NOW - TTL_MS - 2 }],
      ['old2', { lastUpdated: NOW - TTL_MS }],
      ['fresh', { lastUpdated: NOW - TTL_MS + 1 }],
    ])
    set(cache, 'new', NOW)
    expect([...cache.keys()]).toEqual(['fresh', 'new'])
  })

  it('evicts the oldest fresh entries once over the cap', () => {
    const cache = new Map<string, Entry>()
    for (const key of ['a', 'b', 'c', 'd']) set(cache, key, NOW, 3)
    expect([...cache.keys()]).toEqual(['b', 'c', 'd'])
  })

  it('moves a rewritten key to the back so it is not evicted as oldest', () => {
    const cache = new Map<string, Entry>()
    set(cache, 'a', NOW, 2)
    set(cache, 'b', NOW, 2)
    set(cache, 'a', NOW, 2)
    set(cache, 'c', NOW, 2)
    expect([...cache.keys()]).toEqual(['a', 'c'])
  })

  it('replaces the value for an existing key', () => {
    const cache = new Map<string, Entry>()
    set(cache, 'a', NOW - 10)
    set(cache, 'a', NOW)
    expect(cache.size).toBe(1)
    expect(cache.get('a')?.lastUpdated).toBe(NOW)
  })
})
