import { createHash } from 'crypto'

export const QUERY_EMBEDDING_DIMENSIONS = 1536

export const normalizeSemanticSearchTerm = (term: string) =>
  term.trim().replace(/\s+/g, ' ')

export const queryEmbeddingCacheKey = (term: string, model: string) =>
  `search-embedding:${model}:${createHash('sha256')
    .update(term)
    .digest('base64url')}`

export const isValidQueryEmbedding = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === QUERY_EMBEDDING_DIMENSIONS &&
  value.every((item) => typeof item === 'number' && Number.isFinite(item))

export const shouldAttemptSemanticFallback = (args: {
  term: string
  offset: number
  sort: string
  beforeTime?: number
  lexicalResultCount: number
  limit: number
  minResults: number
  minTermLength: number
  maxTermLength: number
}) => {
  const {
    term,
    offset,
    sort,
    beforeTime,
    lexicalResultCount,
    limit,
    minResults,
    minTermLength,
    maxTermLength,
  } = args
  const lowerTerm = term.toLowerCase()
  return !(
    offset > 0 ||
    sort === 'newest' ||
    beforeTime !== undefined ||
    lowerTerm.startsWith('https://') ||
    lowerTerm.startsWith('http://') ||
    term.length < minTermLength ||
    term.length > maxTermLength ||
    lexicalResultCount >= Math.min(limit, minResults)
  )
}

type Clock = () => number

export class RollingWindowGate {
  private eventTimes: number[] = []

  constructor(
    private readonly maxEvents: number,
    private readonly windowMs: number,
    private readonly now: Clock = Date.now
  ) {}

  take() {
    const now = this.now()
    this.eventTimes = this.eventTimes.filter(
      (time) => now - time < this.windowMs
    )
    if (this.eventTimes.length >= this.maxEvents) return false
    this.eventTimes.push(now)
    return true
  }
}

/** Atomically enforces a hard global ceiling and a fair per-caller budget. */
export class HierarchicalRollingWindowGate {
  private globalEventTimes: number[] = []
  private readonly eventTimesByKey = new Map<string, number[]>()

  constructor(
    private readonly maxGlobalEvents: number,
    private readonly maxEventsPerKey: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
    private readonly now: Clock = Date.now
  ) {}

  take(key: string) {
    const now = this.now()
    const globalEventTimes = this.globalEventTimes.filter(
      (time) => now - time < this.windowMs
    )
    this.globalEventTimes = globalEventTimes

    // Reject globally before touching caller state. Otherwise attempts during
    // saturation can leave an innocent caller locally blocked after global
    // capacity has recovered.
    if (globalEventTimes.length >= this.maxGlobalEvents) return false

    const eventTimes = (this.eventTimesByKey.get(key) ?? []).filter(
      (time) => now - time < this.windowMs
    )

    if (eventTimes.length >= this.maxEventsPerKey) {
      this.remember(key, eventTimes)
      return false
    }

    globalEventTimes.push(now)
    eventTimes.push(now)
    this.remember(key, eventTimes)
    return true
  }

  private remember(key: string, eventTimes: number[]) {
    // Refresh insertion order so abandoned callers are evicted before active
    // ones when a public endpoint sees more distinct IPs than the bound.
    this.eventTimesByKey.delete(key)
    this.eventTimesByKey.set(key, eventTimes)
    while (this.eventTimesByKey.size > this.maxKeys) {
      const oldestKey = this.eventTimesByKey.keys().next().value
      if (oldestKey === undefined) break
      this.eventTimesByKey.delete(oldestKey)
    }
  }
}

export class BoundedSingleFlightCache<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>()
  private readonly pending = new Map<string, Promise<T | undefined>>()
  private inflightCreates = 0

  constructor(
    private readonly options: {
      maxEntries: number
      ttlMs: number
      maxInflightCreates: number
      now?: Clock
    }
  ) {}

  get(key: string) {
    const cached = this.values.get(key)
    if (!cached) return undefined
    if (cached.expiresAt <= (this.options.now ?? Date.now)()) {
      this.values.delete(key)
      return undefined
    }
    // Refresh insertion order to make this an LRU rather than FIFO cache.
    this.values.delete(key)
    this.values.set(key, cached)
    return cached.value
  }

  set(key: string, value: T) {
    this.values.delete(key)
    this.values.set(key, {
      value,
      expiresAt: (this.options.now ?? Date.now)() + this.options.ttlMs,
    })
    while (this.values.size > this.options.maxEntries) {
      const oldestKey = this.values.keys().next().value
      if (oldestKey === undefined) break
      this.values.delete(oldestKey)
    }
  }

  getOrCreate(
    key: string,
    create: () => Promise<T | undefined>,
    allowCreate: () => boolean = () => true
  ) {
    const cached = this.get(key)
    if (cached !== undefined) return Promise.resolve(cached)

    const pending = this.pending.get(key)
    if (pending) return pending
    if (
      this.inflightCreates >= this.options.maxInflightCreates ||
      !allowCreate()
    )
      return undefined

    this.inflightCreates++
    const request = Promise.resolve()
      .then(create)
      .then((value) => {
        if (value !== undefined) this.set(key, value)
        return value
      })
      .finally(() => {
        this.inflightCreates--
        this.pending.delete(key)
      })
    this.pending.set(key, request)
    return request
  }
}
