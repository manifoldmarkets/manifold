import {
  createBdlFixtureTransport,
  requireBdlLocalOnly,
} from './balldontlie-fixture'
import { BdlParams, bdlUrl } from './balldontlie-request'

export { type BdlParams, bdlRecordingPathParts } from './balldontlie-request'

export type BdlClock = {
  now: () => number
  sleep: (ms: number) => Promise<void>
}
const wallClock: BdlClock = {
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export function bdlClock(): BdlClock {
  const fakeNow = process.env.SPORTS_FAKE_NOW
  if (fakeNow == null) return wallClock
  requireBdlLocalOnly()
  let time = Date.parse(fakeNow)
  if (!Number.isFinite(time))
    throw new Error('[sports-bdl-client] Invalid SPORTS_FAKE_NOW')
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    },
  }
}

/** A one-token bucket. Queue concurrent callers and space actual starts after slow waits. */
export class BdlRateLimiter {
  private next = 0
  private tail: Promise<void> = Promise.resolve()
  private readonly interval: number
  constructor(ratePerMinute: number, private readonly clock = wallClock) {
    if (
      !Number.isFinite(ratePerMinute) ||
      ratePerMinute <= 0 ||
      !Number.isSafeInteger(Math.ceil(60_000 / ratePerMinute))
    )
      throw new Error('[sports-bdl-client] Invalid request rate')
    this.interval = Math.ceil(60_000 / ratePerMinute)
  }

  deferUntil(time: number) {
    if (Number.isFinite(time)) this.next = Math.max(this.next, time)
  }

  acquire() {
    const ticket = this.tail.then(async () => {
      while (this.clock.now() < this.next) {
        // Node timers above 2^31-1 ms overflow to one millisecond.
        await this.clock.sleep(
          Math.min(this.next - this.clock.now(), 2_147_483_647)
        )
      }
      this.next = this.clock.now() + this.interval
    })
    this.tail = ticket.catch(() => undefined)
    return ticket
  }
}

export const BDL_DEFAULT_RATE_PER_MINUTE = 3
const processLimiter = new BdlRateLimiter(BDL_DEFAULT_RATE_PER_MINUTE)

export type BdlAttempt = {
  request: { path: string; params: BdlParams; at: string }
  status: number
  rateLimit: { limit: number | null; remaining: number | null }
  body: unknown
}

export class BdlHttpError extends Error {
  constructor(readonly status: number, detail: string) {
    super('[sports-bdl-client] HTTP ' + status + ': ' + detail)
    this.name = 'BdlHttpError'
  }
}

export class BdlEntitlementError extends BdlHttpError {
  constructor() {
    super(401, 'missing or invalid key, or a plan without this endpoint')
  }
}

export class BdlRateLimitError extends BdlHttpError {
  constructor() {
    super(429, 'rate limited')
  }
}

export class BdlServerError extends BdlHttpError {
  constructor(status: number) {
    super(status, 'provider service error')
  }
}

function httpError(status: number) {
  if (status === 401) return new BdlEntitlementError()
  if (status === 429) return new BdlRateLimitError()
  if (status >= 500) return new BdlServerError(status)
  return new BdlHttpError(status, 'request refused')
}

function numericHeader(headers: Headers, name: string) {
  const value = headers.get(name)?.trim()
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function resetAt(headers: Headers, now: number) {
  const n = numericHeader(headers, 'x-ratelimit-reset')
  if (n === null) return 0
  // Providers use Unix seconds or milliseconds, or a countdown in seconds.
  return n >= 1e12 ? n : n >= 1e9 ? n * 1000 : now + n * 1000
}

function retryAt(headers: Headers, now: number) {
  const raw = headers.get('retry-after')
  if (!raw) return 0
  const seconds = numericHeader(headers, 'retry-after')
  if (seconds !== null) return now + seconds * 1000
  return Date.parse(raw) || 0
}

export type BdlClientOptions = {
  key?: string
  clock?: BdlClock
  limiter?: Pick<BdlRateLimiter, 'acquire' | 'deferUntil'>
  transport?: (url: string, init: RequestInit) => Promise<Response>
  maxAttempts?: number
  onAttempt?: (attempt: BdlAttempt) => void | Promise<void>
}

export function createBdlClient(options: BdlClientOptions = {}) {
  const clock = options.clock ?? bdlClock()
  const fixture = process.env.BDL_FIXTURE_DIR
    ? createBdlFixtureTransport(clock.now)
    : undefined
  if (process.env.SPORTS_FAKE_NOW != null && !fixture)
    throw new Error(
      '[sports-bdl-client] Fake time requires fixtures for BDL requests'
    )
  const limiter =
    options.limiter ??
    (clock === wallClock
      ? processLimiter
      : new BdlRateLimiter(BDL_DEFAULT_RATE_PER_MINUTE, clock))
  const maxAttempts = options.maxAttempts ?? 3
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 32)
    throw new Error('[sports-bdl-client] Invalid attempt count')

  const get = async (
    path: string,
    params: BdlParams = {}
  ): Promise<BdlAttempt> => {
    const url = bdlUrl(path, params)
    const key = fixture ? undefined : options.key
    if (!fixture && !key)
      throw new Error('[sports-bdl-client] A BDL key is required')
    if (
      key &&
      (path.includes(key) ||
        JSON.stringify(params).includes(JSON.stringify(key).slice(1, -1)))
    )
      throw new Error(
        '[sports-bdl-client] Credential found in request parameters'
      )
    for (let attemptIndex = 0; ; attemptIndex++) {
      await limiter.acquire()
      const request = { path, params, at: new Date(clock.now()).toISOString() }
      const res = fixture
        ? await fixture(path, params)
        : await (options.transport ?? fetch)(url.toString(), {
            method: 'GET',
            headers: { Authorization: key as string },
            signal: AbortSignal.timeout(15_000),
            redirect: 'error',
          }).catch(() => {
            throw new Error('[sports-bdl-client] BDL connection failed')
          })

      const rateLimit = {
        limit: numericHeader(res.headers, 'x-ratelimit-limit'),
        remaining: numericHeader(res.headers, 'x-ratelimit-remaining'),
      }
      const now = clock.now()
      const retryable = res.status === 429 || res.status >= 500
      if (rateLimit.remaining === 0)
        limiter.deferUntil(resetAt(res.headers, now))
      if (retryable) {
        const backoff = Math.min(60_000, 1000 * 2 ** attemptIndex)
        limiter.deferUntil(
          Math.max(
            now + backoff,
            retryAt(res.headers, now),
            resetAt(res.headers, now)
          )
        )
      }
      let body: unknown
      try {
        body = await res.json()
      } catch {
        if (res.ok && res.status !== 204 && res.status !== 205)
          throw new Error('[sports-bdl-client] Invalid JSON from provider')
        body = null
      }
      if (
        key &&
        JSON.stringify({ body, rateLimit }).includes(
          JSON.stringify(key).slice(1, -1)
        )
      )
        throw new Error(
          '[sports-bdl-client] Credential found in provider response'
        )
      const attempt = { request, status: res.status, rateLimit, body }
      await options.onAttempt?.(attempt)
      if (res.ok) return attempt
      if (!retryable || attemptIndex + 1 >= maxAttempts)
        throw httpError(res.status)
    }
  }

  /** Adapters supply the endpoint cap and check every row against the requested identifiers. */
  const getAll = async <T>(
    path: string,
    params: BdlParams,
    { maxPages, matches }: { maxPages: number; matches: (row: T) => boolean }
  ): Promise<T[]> => {
    if (!Number.isSafeInteger(maxPages) || maxPages < 1)
      throw new Error('[sports-bdl-client] Invalid page cap')
    const rows: T[] = []
    const cursors = new Set<string>()
    let cursor = params.cursor
    for (let i = 0; i < maxPages; i++) {
      if (cursor != null) {
        if (cursors.has(String(cursor)))
          throw new Error('[sports-bdl-client] Repeated cursor')
        cursors.add(String(cursor))
      }
      const pageParams = {
        per_page: 100,
        ...params,
        ...(cursor != null ? { cursor } : {}),
      }
      const { body } = await get(path, pageParams)
      const page = body as {
        data?: T[]
        meta?: { next_cursor?: unknown }
      } | null
      if (!Array.isArray(page?.data))
        throw new Error('[sports-bdl-client] Response has no data array')
      if (!page.data.every(matches))
        throw new Error(
          '[sports-bdl-client] Provider ignored the requested filter'
        )
      rows.push(...page.data)
      const next = page.meta?.next_cursor
      if (next == null || next === '') return rows
      if (
        typeof next !== 'string' &&
        !(typeof next === 'number' && Number.isFinite(next))
      )
        throw new Error('[sports-bdl-client] Invalid next cursor')
      cursor = String(next)
    }
    throw new Error('[sports-bdl-client] Page cap exceeded')
  }
  return { get, getAll }
}
