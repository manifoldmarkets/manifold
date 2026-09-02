import {
  BoundedSingleFlightCache,
  HierarchicalRollingWindowGate,
  isValidQueryEmbedding,
  normalizeSemanticSearchTerm,
  queryEmbeddingCacheKey,
  RollingWindowGate,
  shouldAttemptSemanticFallback,
} from './semantic-search-fallback'

const makeCache = (now: () => number) =>
  new BoundedSingleFlightCache<string>({
    maxEntries: 2,
    ttlMs: 100,
    maxInflightCreates: 2,
    now,
  })

describe('BoundedSingleFlightCache', () => {
  it('expires entries and evicts the least recently used value', () => {
    let time = 0
    const cache = makeCache(() => time)
    cache.set('a', 'A')
    cache.set('b', 'B')
    expect(cache.get('a')).toBe('A')
    cache.set('c', 'C')

    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('A')
    time = 101
    expect(cache.get('a')).toBeUndefined()
  })

  it('shares concurrent creates and caches the result', async () => {
    const cache = makeCache(() => 0)
    const create = jest.fn(async () => 'value')

    await expect(
      Promise.all([
        cache.getOrCreate('key', create),
        cache.getOrCreate('key', create),
      ])
    ).resolves.toEqual(['value', 'value'])
    await expect(cache.getOrCreate('key', create)).resolves.toBe('value')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('clears a rejected create so a later call can retry', async () => {
    const cache = makeCache(() => 0)

    await expect(
      cache.getOrCreate('key', async () => {
        throw new Error('failed')
      })
    ).rejects.toThrow('failed')
    await expect(cache.getOrCreate('key', async () => 'ok')).resolves.toBe('ok')
  })

  it('checks caller allowance only for the request that creates a value', async () => {
    const cache = makeCache(() => 0)
    const create = jest.fn(async () => 'value')
    const deny = jest.fn(() => false)

    expect(cache.getOrCreate('key', create, deny)).toBeUndefined()
    expect(create).not.toHaveBeenCalled()

    const allow = jest.fn(() => true)
    await expect(
      Promise.all([
        cache.getOrCreate('key', create, allow),
        cache.getOrCreate('key', create, allow),
      ])
    ).resolves.toEqual(['value', 'value'])
    expect(allow).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('RollingWindowGate', () => {
  it('enforces its budget and recovers when the window expires', () => {
    let time = 0
    const gate = new RollingWindowGate(2, 1_000, () => time)

    expect(gate.take()).toBe(true)
    expect(gate.take()).toBe(true)
    expect(gate.take()).toBe(false)
    time = 1_000
    expect(gate.take()).toBe(true)
  })
})

describe('HierarchicalRollingWindowGate', () => {
  it("keeps one caller from consuming another caller's allowance", () => {
    let time = 0
    const gate = new HierarchicalRollingWindowGate(3, 2, 1_000, 100, () => time)

    expect(gate.take('caller-a')).toBe(true)
    expect(gate.take('caller-a')).toBe(true)
    expect(gate.take('caller-a')).toBe(false)
    expect(gate.take('caller-b')).toBe(true)

    time = 1_000
    expect(gate.take('caller-a')).toBe(true)
  })

  it('does not charge a caller when the global budget rejects it', () => {
    let time = 0
    const gate = new HierarchicalRollingWindowGate(1, 1, 1_000, 100, () => time)

    expect(gate.take('caller-a')).toBe(true)
    time = 500
    expect(gate.take('caller-b')).toBe(false)
    time = 1_000
    expect(gate.take('caller-b')).toBe(true)
  })
})

describe('semantic fallback inputs', () => {
  const eligibility = {
    offset: 0,
    sort: 'score',
    lexicalResultCount: 0,
    limit: 40,
    minResults: 5,
    minTermLength: 3,
    maxTermLength: 200,
  }

  it('normalizes whitespace without conflating case-sensitive cache keys', () => {
    expect(normalizeSemanticSearchTerm('  US   election ')).toBe('US election')
  })

  it('uses stable model-versioned cache keys without exposing search text', () => {
    const key = queryEmbeddingCacheKey('private medical question', 'model-v1')

    expect(key).toBe(
      queryEmbeddingCacheKey('private medical question', 'model-v1')
    )
    expect(key).not.toContain('private medical question')
    expect(queryEmbeddingCacheKey('US', 'model-v1')).not.toBe(
      queryEmbeddingCacheKey('us', 'model-v1')
    )
    expect(queryEmbeddingCacheKey('US', 'model-v1')).not.toBe(
      queryEmbeddingCacheKey('US', 'model-v2')
    )
  })

  it('skips whitespace, URLs, newest cursors, later pages, and full pages', () => {
    expect(shouldAttemptSemanticFallback({ ...eligibility, term: '' })).toBe(
      false
    )
    expect(
      shouldAttemptSemanticFallback({
        ...eligibility,
        term: 'HTTP://example.com/market',
      })
    ).toBe(false)
    expect(
      shouldAttemptSemanticFallback({
        ...eligibility,
        term: 'election',
        sort: 'newest',
      })
    ).toBe(false)
    expect(
      shouldAttemptSemanticFallback({
        ...eligibility,
        term: 'election',
        offset: 40,
      })
    ).toBe(false)
    expect(
      shouldAttemptSemanticFallback({
        ...eligibility,
        term: 'election',
        lexicalResultCount: 4,
        limit: 4,
      })
    ).toBe(false)
  })

  it('validates the exact finite vector shape expected by pgvector', () => {
    expect(isValidQueryEmbedding(Array(1536).fill(0))).toBe(true)
    expect(isValidQueryEmbedding(Array(1535).fill(0))).toBe(false)
    expect(isValidQueryEmbedding([...Array(1535).fill(0), Number.NaN])).toBe(
      false
    )
    expect(
      isValidQueryEmbedding([...Array(1535).fill(0), Number.POSITIVE_INFINITY])
    ).toBe(false)
  })
})
