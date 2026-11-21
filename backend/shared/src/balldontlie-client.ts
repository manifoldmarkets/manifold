import {
  BDL_QUOTA_PAUSE_FRACTION,
  BDL_QUOTA_SLOW_FRACTION,
  BDL_REQUESTS_PER_MINUTE,
} from 'common/bdl/constants'
import { BDL_LEAGUES, BdlLeagueKey, isBdlLeagueKey } from 'common/bdl/leagues'

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

type BdlRole = keyof typeof BDL_REQUESTS_PER_MINUTE
type Quota = { limit: number | null; remaining: number | null }
const MINUTE_MS = 60_000

/** One token at most, shared by all requests in this process role. Applying
 * the cap to the combined stream also bounds every individual league slug. */
export class BdlRateLimiter {
  private next = 0
  private lastAt = -Infinity
  private lastInterval = 0
  private slowUntil = 0
  private lastQuotaRequest = -Infinity
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly rate: number,
    private readonly clock = wallClock
  ) {
    this.interval(rate)
  }

  private interval(rate: number) {
    const value = Math.ceil(MINUTE_MS / rate)
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isSafeInteger(value))
      throw new Error('[sports-bdl-client] Invalid request rate')
    return value
  }

  deferUntil(time: number) {
    if (Number.isFinite(time)) this.next = Math.max(this.next, time)
  }

  observeQuota(
    { remaining, limit }: Quota,
    reset: number,
    requestedAt: number
  ) {
    if (remaining === null) return
    const now = this.clock.now()
    const until = reset > now ? reset : now + MINUTE_MS
    if (remaining === 0) this.deferUntil(until)
    if (limit === null || limit <= 0 || remaining > limit) return
    const fraction = remaining / limit
    if (requestedAt >= this.lastQuotaRequest) {
      this.lastQuotaRequest = requestedAt
      this.slowUntil = fraction < BDL_QUOTA_SLOW_FRACTION ? until : 0
    }
    if (fraction < BDL_QUOTA_PAUSE_FRACTION) this.deferUntil(until)
  }

  acquire(
    rate = this.rate,
    externalSlot?: (effectiveRate: number) => Promise<void>
  ) {
    const interval = this.interval(rate)
    const ticket = this.tail.then(async () => {
      for (;;) {
        const now = this.clock.now()
        const slow = now < this.slowUntil
        const gap = Math.max(interval, this.lastInterval) * (slow ? 2 : 1)
        const due = Math.max(this.next, this.lastAt + gap)
        if (now >= due) {
          if (externalSlot) {
            await externalSlot(slow ? rate / 2 : rate)
            // A response could have paused or slowed this key during the external wait.
            if (
              this.clock.now() < this.next ||
              (!slow && this.clock.now() < this.slowUntil)
            )
              continue
          }
          this.lastAt = this.clock.now()
          this.lastInterval = interval
          return
        }
        // Recalculate when the quota window resets. Long Node timers overflow.
        await this.clock.sleep(
          Math.min(
            due - now,
            slow ? this.slowUntil - now : Infinity,
            2_147_483_647
          )
        )
      }
    })
    this.tail = ticket.catch(() => undefined)
    return ticket
  }
}

const processBudgets = new WeakMap<BdlClock, Map<BdlRole, BdlRateLimiter>>()
function processBudget(clock: BdlClock, role: BdlRole) {
  let budgets = processBudgets.get(clock)
  if (!budgets) {
    budgets = new Map()
    processBudgets.set(clock, budgets)
  }
  let budget = budgets.get(role)
  if (!budget) {
    budget = new BdlRateLimiter(BDL_REQUESTS_PER_MINUTE[role], clock)
    budgets.set(role, budget)
  }
  return budget
}

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
  role?: BdlRole
  /** Current service switches. Manual recorder and fixture queries do not create markets. */
  enabledLeagues?: ReadonlySet<BdlLeagueKey>
  /** Explicit recorder CLI rate (including its lower trial rate or approved paid run). */
  recorderRate?: number
  /** Additional machine-wide slot for recorder processes sharing one credential. */
  acquireSharedSlot?: (rate: number) => Promise<void>
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
  const role = options.role ?? (fixture ? 'codex' : 'dev')
  if (options.recorderRate !== undefined && role !== 'recorder')
    throw new Error(
      '[sports-bdl-client] Only the manual recorder can override its role budget'
    )
  const rate = options.recorderRate ?? BDL_REQUESTS_PER_MINUTE[role]
  const limiter = processBudget(clock, role)
  function leagueIsOn(path: string) {
    if (role === 'recorder' || role === 'codex') return true
    const slug = path.slice(1).split(/\/v[1-9]\d*\//, 1)[0]
    return (
      isBdlLeagueKey(slug) &&
      (options.enabledLeagues?.has(slug) ?? BDL_LEAGUES[slug].defaultAutoCreate)
    )
  }
  const maxAttempts = options.maxAttempts ?? 3
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 32)
    throw new Error('[sports-bdl-client] Invalid attempt count')

  const get = async (
    path: string,
    params: BdlParams = {}
  ): Promise<BdlAttempt> => {
    const url = bdlUrl(path, params)
    if (!leagueIsOn(path))
      throw new Error('[sports-bdl-client] League disabled')
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
      if (!leagueIsOn(path))
        throw new Error('[sports-bdl-client] League disabled')
      await limiter.acquire(rate, options.acquireSharedSlot)
      if (!leagueIsOn(path))
        throw new Error('[sports-bdl-client] League disabled')
      const requestedAt = clock.now()
      const request = { path, params, at: new Date(requestedAt).toISOString() }
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
      limiter.observeQuota(rateLimit, resetAt(res.headers, now), requestedAt)
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
    if (!leagueIsOn(path)) {
      bdlUrl(path, params)
      return []
    }
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
