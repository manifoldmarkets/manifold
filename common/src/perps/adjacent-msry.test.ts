import {
  ADJACENT_MSRY_FEED_ID,
  buildMsryObservation,
  MSRY_MAX_SOURCE_AGE_MS,
  parseAdjacentIndexPrices,
} from './adjacent-msry'
import { MAX_ORACLE_FUTURE_SKEW_MS } from './oracle'
import { ORACLE_HEALTH_MAX_AGE_MS } from './oracle-health'
import { isEligiblePerpTick, isProviderStampedFeed } from './orders'

// Captured from GET /api/v1/public/indices/msry/prices?interval=1hour on
// 2026-10-27 (the realtime series has the same shape at finer intervals).
const CAPTURED = {
  data: [
    { timestamp: '2026-10-27T02:12:00Z', price: 8.22 },
    { timestamp: '2026-10-27T01:00:00Z', price: 8.22 },
    { timestamp: '2026-10-27T00:00:00Z', price: 8.22 },
    { timestamp: '2026-10-26T23:00:00Z', price: 8.22 },
    { timestamp: '2026-10-26T22:00:00Z', price: 8.22 },
  ],
  meta: {
    total: 5,
    page: 1,
    per_page: 5,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  },
}

const MINUTE = 60_000
const t0 = Date.parse('2026-10-27T02:12:00Z')

describe('parseAdjacentIndexPrices', () => {
  it('parses a captured page, newest first', () => {
    const parsed = parseAdjacentIndexPrices(CAPTURED)
    expect(parsed).toEqual({
      ok: true,
      rows: CAPTURED.data.map((row) => ({
        sourceTs: Date.parse(row.timestamp),
        price: row.price,
      })),
    })
  })

  it('sorts newest first whatever order the page arrives in', () => {
    const parsed = parseAdjacentIndexPrices({
      data: [...CAPTURED.data].reverse(),
    })
    expect(parsed.ok && parsed.rows.map((r) => r.sourceTs)).toEqual(
      CAPTURED.data.map((row) => Date.parse(row.timestamp))
    )
  })

  it('accepts an empty page, and a 0 print the methodology allows', () => {
    expect(parseAdjacentIndexPrices({ data: [] })).toEqual({
      ok: true,
      rows: [],
    })
    expect(
      parseAdjacentIndexPrices({
        data: [{ timestamp: '2026-10-27T02:12:00Z', price: 0 }],
      })
    ).toEqual({ ok: true, rows: [{ sourceTs: t0, price: 0 }] })
  })

  it.each([
    ['a non-object', null],
    ['an array', []],
    ['missing data', { meta: {} }],
    ['an error body', { error: 'Insufficient scope', status: 403 }],
  ])('rejects %s', (_label, body) => {
    expect(parseAdjacentIndexPrices(body).ok).toBe(false)
  })

  it.each([
    ['a string price', { timestamp: '2026-10-27T02:12:00Z', price: '8.22' }],
    ['a null price', { timestamp: '2026-10-27T02:12:00Z', price: null }],
    ['a negative price', { timestamp: '2026-10-27T02:12:00Z', price: -1 }],
    ['a NaN price', { timestamp: '2026-10-27T02:12:00Z', price: NaN }],
    ['a zone-less timestamp', { timestamp: '2026-10-27T02:12:00', price: 8 }],
    ['a date-only timestamp', { timestamp: '2026-10-27', price: 8 }],
    ['epoch seconds', { timestamp: 1793067120, price: 8 }],
    ['a pre-2020 timestamp', { timestamp: '1970-01-01T00:00:00Z', price: 8 }],
    ['an unparseable timestamp', { timestamp: '2026-13-45T99:00Z', price: 8 }],
  ])('rejects the whole page on %s', (_label, row) => {
    const parsed = parseAdjacentIndexPrices({
      data: [CAPTURED.data[0], row],
    })
    expect(parsed.ok).toBe(false)
  })

  it('rejects two values for one bucket', () => {
    const parsed = parseAdjacentIndexPrices({
      data: [
        { timestamp: '2026-10-27T02:12:00Z', price: 8.22 },
        { timestamp: '2026-10-27T02:12:00.000Z', price: 8.23 },
      ],
    })
    expect(parsed).toEqual({
      ok: false,
      reason: 'duplicate timestamp 2026-10-27T02:12:00.000Z',
    })
  })

  it('reads an explicit offset as that instant', () => {
    const parsed = parseAdjacentIndexPrices({
      data: [{ timestamp: '2026-10-26T22:12:00-04:00', price: 8.22 }],
    })
    expect(parsed.ok && parsed.rows[0].sourceTs).toBe(t0)
  })
})

describe('buildMsryObservation', () => {
  const fetchedAt = t0 + 25_000
  const rows = [
    { sourceTs: t0, price: 8.22 },
    { sourceTs: t0 - MINUTE, price: 8.21 },
  ]

  it('stamps a new minute now, with the bucket start as its source time', () => {
    expect(buildMsryObservation(rows, fetchedAt)).toEqual({
      point: { ts: fetchedAt, sourceTs: t0, price: 8.22 },
      health: {
        checkedAt: fetchedAt,
        status: 'available',
        expiresAt: Math.min(
          fetchedAt + ORACLE_HEALTH_MAX_AGE_MS,
          t0 + MSRY_MAX_SOURCE_AGE_MS
        ),
      },
    })
  })

  it('uses the newest row even if handed out of order', () => {
    const observation = buildMsryObservation([...rows].reverse(), fetchedAt)
    expect(observation.point?.sourceTs).toBe(t0)
  })

  it('is unavailable, with no point, when there is nothing to publish', () => {
    expect(buildMsryObservation([], fetchedAt)).toEqual({
      health: {
        checkedAt: fetchedAt,
        status: 'unavailable',
        reason: 'Adjacent returned no MSRY values',
      },
    })
  })

  it('is unavailable once the newest value is older than the source limit', () => {
    const at = t0 + MSRY_MAX_SOURCE_AGE_MS
    expect(buildMsryObservation(rows, at).health.status).toBe('available')
    const stale = buildMsryObservation(rows, at + 1)
    expect(stale.point).toBeUndefined()
    expect(stale.health.status).toBe('unavailable')
    expect(stale.health.reason).toMatch(/old/)
  })

  it('refuses a value stamped beyond the future-skew allowance', () => {
    const ahead = [
      { sourceTs: fetchedAt + MAX_ORACLE_FUTURE_SKEW_MS + 1, price: 8 },
    ]
    const observation = buildMsryObservation(ahead, fetchedAt)
    expect(observation.point).toBeUndefined()
    expect(observation.health.status).toBe('unavailable')
  })

  it('gives the same minute at the same value a fresh stamp', () => {
    const previous = { ts: t0 + 5_000, sourceTs: t0, price: 8.22 }
    expect(buildMsryObservation(rows, fetchedAt, previous).point).toEqual({
      ts: fetchedAt,
      sourceTs: t0,
      price: 8.22,
    })
  })

  it('keeps the published value when Adjacent re-records a minute', () => {
    const previous = { ts: t0 + 5_000, sourceTs: t0, price: 8.21 }
    const observation = buildMsryObservation(rows, fetchedAt, previous)
    expect(observation.point).toBe(previous)
    expect(observation.health.status).toBe('available')
    expect(observation.revision).toEqual({
      sourceTs: t0,
      published: 8.21,
      latest: 8.22,
    })
  })

  it('re-observes the previous point when served an older minute', () => {
    const previous = {
      ts: t0 + MINUTE + 5_000,
      sourceTs: t0 + MINUTE,
      price: 8.23,
    }
    const at = t0 + MINUTE + 25_000
    const observation = buildMsryObservation(rows, at, previous)
    expect(observation.point).toBe(previous)
    expect(observation.health).toEqual({
      checkedAt: at,
      status: 'available',
      expiresAt: Math.min(
        at + ORACLE_HEALTH_MAX_AGE_MS,
        t0 + MINUTE + MSRY_MAX_SOURCE_AGE_MS
      ),
    })
    expect(observation.revision).toBeUndefined()
  })

  it('throws on an invalid fetch time rather than stamping garbage', () => {
    expect(() => buildMsryObservation(rows, NaN)).toThrow()
  })
})

describe('MSRY next-price eligibility', () => {
  it('is provider-stamped, like MNX', () => {
    expect(isProviderStampedFeed(ADJACENT_MSRY_FEED_ID)).toBe(true)
    expect(isProviderStampedFeed('mnx-openai-mark')).toBe(true)
    expect(isProviderStampedFeed('btc-usd')).toBe(false)
    expect(isProviderStampedFeed('crypto-fear-greed')).toBe(false)
  })

  it('never fills an order at a minute that began before it was placed', () => {
    const created = t0 + 30_000
    // Received after the order, but Adjacent computed it before.
    expect(
      isEligiblePerpTick(ADJACENT_MSRY_FEED_ID, created, {
        ts: created + 10_000,
        sourceTs: t0,
        price: 8.22,
      })
    ).toBe(false)
    // The next minute fills it.
    expect(
      isEligiblePerpTick(ADJACENT_MSRY_FEED_ID, created, {
        ts: t0 + MINUTE + 5_000,
        sourceTs: t0 + MINUTE,
        price: 8.22,
      })
    ).toBe(true)
  })
})
