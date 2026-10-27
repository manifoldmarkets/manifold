import {
  MSRY_MAX_PRICE,
  MSRY_MAX_SOURCE_AGE_MS,
  MSRY_MIN_PRICE,
  MSRY_POLL_MS,
} from 'common/perps/adjacent-msry'
import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'

import {
  adjacentRetryDelay,
  ADJACENT_API_URL,
  AdjacentHttpError,
  createAdjacentMsryObserver,
  fetchAdjacentIndexPrices,
} from './adjacent-msry'
import { ADJACENT_MSRY_FEED_ID } from './oracle'
import { OracleProviderError } from './oracle-provider'
import { getMinTradingMarkAgeMs, getOracleFeed } from './oracle-feeds'
import {
  ALL_PERP_LAUNCH_MARKETS,
  PERP_LAUNCH_PENDING_MARKETS,
  getPerpLaunchManifestErrors,
} from './perps/launch-manifest'

jest.mock('./utils', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))

// Presence checks for the `adjacent-msry` feed: registry, attribution, chart
// decoration, ticker, pending launch entry. A missing entry is a red build
// rather than a runtime surprise.
describe('adjacent-msry feed wiring', () => {
  const id = ADJACENT_MSRY_FEED_ID

  it('is a fast observation feed with creation disabled', () => {
    const feed = getOracleFeed(id)
    expect(feed?.cadence).toBe('fast')
    expect(feed?.marketCreationEnabled).toBe(false)
    expect(feed?.fetchObservation).toBeDefined()
    expect(feed?.pollPeriodMs).toBe(MSRY_POLL_MS)
    expect(feed?.minPrice).toBe(MSRY_MIN_PRICE)
    expect(feed?.maxPrice).toBe(MSRY_MAX_PRICE)
    expect(feed?.staleAfterMs).toBe(MSRY_MAX_SOURCE_AGE_MS)
    expect(feed?.updatePeriodMs).toBe(MINUTE_MS)
  })

  it('polls well inside the organization-wide Pro budget', () => {
    // 30/minute and 20,000/day per Adjacent organization, shared by dev, prod
    // and deploy overlap: four pollers must fit with room to spare.
    const perPollerPerMinute = MINUTE_MS / MSRY_POLL_MS
    expect(4 * perPollerPerMinute).toBeLessThanOrEqual(15)
    expect(2 * perPollerPerMinute * 24 * 60).toBeLessThanOrEqual(10_000)
  })

  it('lets a market gate trading well under the source limit', () => {
    const feed = getOracleFeed(id)
    if (!feed) throw new Error('missing feed')
    expect(getMinTradingMarkAgeMs(feed)).toBeLessThan(MSRY_MAX_SOURCE_AGE_MS)
  })

  it('credits Adjacent with a link and claims no licence', () => {
    const attribution = getOracleAttribution(id)
    expect(attribution?.source).toBe('Adjacent Misery Implied Index (MSRY)')
    expect(attribution?.url).toBe('https://adjacent.markets/indices/msry')
    expect(attribution?.licence).toBeUndefined()
    expect(attribution?.showAsOf).toBeUndefined()
  })

  it('renders in percent with the MSRY ticker', () => {
    expect(ORACLE_TICK_DECORATIONS[id]).toEqual({ suffix: '%' })
    expect(getPerpFeedTicker(id)).toBe('MSRY')
  })

  it('is pending launch, not launchable, and the manifest stays consistent', () => {
    const pending = PERP_LAUNCH_PENDING_MARKETS.find((m) => m.feedId === id)
    expect(pending?.pendingReason).toMatch(/written permission/)
    expect(pending?.requiredTopics.map((t) => t.name)).toEqual(['Economics'])
    expect(ALL_PERP_LAUNCH_MARKETS.some((m) => m.feedId === id)).toBe(false)
    expect(getPerpLaunchManifestErrors()).toEqual([])
  })
})

// A stand-in for Adjacent: records each request and answers from a script.
const fakeAdjacent = (
  responses: (() => Response | Promise<Response>)[]
): {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  calls: { url: string; init: RequestInit }[]
} => {
  const calls: { url: string; init: RequestInit }[] = []
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init })
      const next = responses.shift()
      if (!next) throw new Error('unexpected request')
      return next()
    },
  }
}
const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
const page = (rows: { timestamp: string; price: number }[]) =>
  json({ data: rows, meta: { has_next: false } })

const t0 = Date.parse('2026-10-27T02:12:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

describe('fetchAdjacentIndexPrices', () => {
  it('sends the key as a bearer header to the realtime route, never in the URL', async () => {
    const adjacent = fakeAdjacent([
      () => page([{ timestamp: iso(t0), price: 8.22 }]),
    ])
    const result = await fetchAdjacentIndexPrices(
      { tier: 'realtime', interval: '1min', perPage: 5 },
      { fetch: adjacent.fetch, apiKey: 'ak_test' }
    )
    expect(result).toEqual({
      rows: [{ sourceTs: t0, price: 8.22 }],
      hasNext: false,
    })
    const [{ url, init }] = adjacent.calls
    expect(url).toBe(
      `${ADJACENT_API_URL}/indices/msry/prices?interval=1min&per_page=5&order=desc`
    )
    expect(url).not.toContain('ak_test')
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer ak_test'
    )
  })

  it('uses the keyless public route for the public tier', async () => {
    const adjacent = fakeAdjacent([() => page([])])
    await fetchAdjacentIndexPrices(
      { tier: 'public', interval: '1hour', perPage: 1000 },
      { fetch: adjacent.fetch }
    )
    expect(adjacent.calls[0].url).toContain('/public/indices/msry/prices?')
    expect(
      (adjacent.calls[0].init.headers as Record<string, string>).authorization
    ).toBeUndefined()
  })

  it('refuses to poll the realtime tier without a key', async () => {
    const adjacent = fakeAdjacent([])
    await expect(
      fetchAdjacentIndexPrices(
        { tier: 'realtime', interval: '1min', perPage: 5 },
        { fetch: adjacent.fetch, apiKey: '' }
      )
    ).rejects.toThrow(OracleProviderError)
    expect(adjacent.calls).toHaveLength(0)
  })

  it("reports Adjacent's own words for a refused key or missing plan", async () => {
    const adjacent = fakeAdjacent([
      () =>
        json(
          {
            error: 'Insufficient scope: a Pro or Premium API plan is required',
            status: 403,
          },
          403
        ),
    ])
    const failure = fetchAdjacentIndexPrices(
      { tier: 'realtime', interval: '1min', perPage: 5 },
      { fetch: adjacent.fetch, apiKey: 'ak_test' }
    )
    await expect(failure).rejects.toThrow(AdjacentHttpError)
    await expect(failure).rejects.toThrow(/403: Insufficient scope/)
  })

  it('rejects a malformed page as a provider error', async () => {
    const adjacent = fakeAdjacent([
      () => json({ data: [{ timestamp: iso(t0), price: '8.22' }] }),
    ])
    await expect(
      fetchAdjacentIndexPrices(
        { tier: 'realtime', interval: '1min', perPage: 5 },
        { fetch: adjacent.fetch, apiKey: 'ak_test' }
      )
    ).rejects.toThrow(/payload rejected/)
  })
})

describe('adjacentRetryDelay', () => {
  const now = t0
  const http = (status: number, retryAfter: string | null) =>
    new AdjacentHttpError(status, retryAfter, '')

  it('backs off only on a 429, for at least one poll and at most an hour', () => {
    expect(adjacentRetryDelay(http(503, '30'), now)).toBe(0)
    expect(adjacentRetryDelay(new Error('boom'), now)).toBe(0)
    expect(adjacentRetryDelay(http(429, '18'), now)).toBe(MSRY_POLL_MS)
    expect(adjacentRetryDelay(http(429, '120'), now)).toBe(120_000)
    expect(adjacentRetryDelay(http(429, '86400'), now)).toBe(HOUR_MS)
    expect(adjacentRetryDelay(http(429, null), now)).toBe(MINUTE_MS)
    expect(adjacentRetryDelay(http(429, iso(now + 90_000)), now)).toBe(90_000)
  })
})

describe('createAdjacentMsryObserver', () => {
  const clockAt = (ms: number) => async () => ms

  it('publishes each new minute and re-observes a minute it has already seen', async () => {
    const adjacent = fakeAdjacent([
      () => page([{ timestamp: iso(t0), price: 8.22 }]),
      // Re-recorded within the minute: the published value stands.
      () => page([{ timestamp: iso(t0), price: 8.23 }]),
      () => page([{ timestamp: iso(t0 + MINUTE_MS), price: 8.23 }]),
    ])
    const observe = createAdjacentMsryObserver({
      fetch: adjacent.fetch,
      apiKey: () => 'ak_test',
    })
    const first = await observe(clockAt(t0 + 5_000))
    expect(first.point).toEqual({ ts: t0 + 5_000, sourceTs: t0, price: 8.22 })
    const second = await observe(clockAt(t0 + 25_000))
    expect(second.point).toBe(first.point)
    expect(second.health.status).toBe('available')
    const third = await observe(clockAt(t0 + MINUTE_MS + 5_000))
    expect(third.point).toEqual({
      ts: t0 + MINUTE_MS + 5_000,
      sourceTs: t0 + MINUTE_MS,
      price: 8.23,
    })
  })

  it('reads the clock before the request so the stamp never postdates the value', async () => {
    const order: string[] = []
    const observe = createAdjacentMsryObserver({
      fetch: async () => {
        order.push('fetch')
        return page([{ timestamp: iso(t0), price: 8.22 }])
      },
      apiKey: () => 'ak_test',
    })
    await observe(async () => {
      order.push('clock')
      return t0 + 5_000
    })
    expect(order).toEqual(['clock', 'fetch'])
  })

  it('reports a stale source as unavailable without a point', async () => {
    const adjacent = fakeAdjacent([
      () => page([{ timestamp: iso(t0), price: 8.22 }]),
    ])
    const observe = createAdjacentMsryObserver({
      fetch: adjacent.fetch,
      apiKey: () => 'ak_test',
    })
    const observation = await observe(clockAt(t0 + MSRY_MAX_SOURCE_AGE_MS + 1))
    expect(observation.point).toBeUndefined()
    expect(observation.health.status).toBe('unavailable')
  })

  it("honours a 429's Retry-After without calling Adjacent again", async () => {
    jest.useFakeTimers({ now: t0 })
    try {
      const adjacent = fakeAdjacent([
        () =>
          json(
            { error: 'rate_limited', limit: 'rpm', message: 'retry after 45s' },
            429,
            { 'retry-after': '45' }
          ),
        () => page([{ timestamp: iso(t0 + MINUTE_MS), price: 8.22 }]),
      ])
      const observe = createAdjacentMsryObserver({
        fetch: adjacent.fetch,
        apiKey: () => 'ak_test',
      })
      await expect(observe(clockAt(t0))).rejects.toThrow(/HTTP 429/)
      jest.setSystemTime(t0 + 20_000)
      await expect(observe(clockAt(t0 + 20_000))).rejects.toThrow(/HTTP 429/)
      expect(adjacent.calls).toHaveLength(1)
      jest.setSystemTime(t0 + 46_000)
      const observation = await observe(clockAt(t0 + MINUTE_MS + 5_000))
      expect(observation.point?.price).toBe(8.22)
      expect(adjacent.calls).toHaveLength(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('fails every poll as a provider error while the key is missing', async () => {
    const adjacent = fakeAdjacent([])
    const observe = createAdjacentMsryObserver({
      fetch: adjacent.fetch,
      apiKey: () => undefined,
    })
    await expect(observe(clockAt(t0))).rejects.toThrow(
      /ADJACENT_API_KEY is not configured/
    )
    expect(adjacent.calls).toHaveLength(0)
  })
})
