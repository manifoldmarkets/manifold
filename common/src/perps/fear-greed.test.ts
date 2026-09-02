import { DAY_MS } from '../util/time'
import {
  FEAR_GREED_EPOCH_MS,
  FEAR_GREED_MAX_SOURCE_AGE_MS,
  fearGreedDayStartUtc,
  parseFearGreedPayload,
} from './fear-greed'

// The provider payload, as documented: newest first, integers as strings,
// unix seconds as strings, and a metadata.error slot.
const payload = (
  rows: {
    value: unknown
    timestamp: unknown
    value_classification?: unknown
  }[],
  metadata: unknown = { error: null }
) => ({
  name: 'Fear and Greed Index',
  data: rows,
  metadata,
})

const T0 = Date.UTC(2026, 8, 2) / 1000 // 2026-09-02T00:00:00Z, seconds

describe('parseFearGreedPayload', () => {
  it('parses a good payload and returns it oldest first', () => {
    const result = parseFearGreedPayload(
      payload([
        {
          value: '52',
          value_classification: 'Neutral',
          timestamp: String(T0),
          time_until_update: '43210',
        } as never,
        {
          value: '47',
          value_classification: 'Fear',
          timestamp: String(T0 - 86400),
        },
      ])
    )
    expect(result).toEqual({
      ok: true,
      points: [
        {
          value: 47,
          sourceTs: (T0 - 86400) * 1000,
          classification: 'Fear',
        },
        { value: 52, sourceTs: T0 * 1000, classification: 'Neutral' },
      ],
    })
  })

  it('accepts a bare number for value and timestamp too', () => {
    const result = parseFearGreedPayload(
      payload([{ value: 12, timestamp: T0 }])
    )
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.points[0]).toEqual({
        value: 12,
        sourceTs: T0 * 1000,
        classification: null,
      })
  })

  it('accepts the range endpoints 0 and 100 — the parser is faithful to the source', () => {
    // Positivity is enforced at publication (registry bounds [1,100]), not
    // by pretending the index cannot print 0.
    for (const value of ['0', '100'])
      expect(
        parseFearGreedPayload(payload([{ value, timestamp: String(T0) }])).ok
      ).toBe(true)
  })

  it('rejects the payload when the provider reports an error', () => {
    const result = parseFearGreedPayload(
      payload([{ value: '52', timestamp: String(T0) }], {
        error: 'rate limit exceeded',
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('rate limit exceeded')
    // ...but an empty-string error, like null, is "no error".
    expect(
      parseFearGreedPayload(
        payload([{ value: '52', timestamp: String(T0) }], { error: '' })
      ).ok
    ).toBe(true)
  })

  it('rejects an out-of-range or non-integer value', () => {
    for (const value of [
      '101',
      '-1',
      '52.5',
      '5e1',
      'fifty',
      '',
      null,
      101,
      52.5,
      NaN,
    ])
      expect([
        value,
        parseFearGreedPayload(payload([{ value, timestamp: String(T0) }])).ok,
      ]).toEqual([value, false])
  })

  it('rejects a timestamp that does not parse as unix seconds', () => {
    for (const timestamp of [
      'yesterday',
      '2026-09-02',
      '',
      '0',
      '-5',
      '1.5',
      null,
      // Milliseconds are not seconds; 2026 in ms parses to the year 56,000.
      // Guard the other direction too: a small integer is 1970, before the
      // index existed.
      '86400',
    ])
      expect([
        timestamp,
        parseFearGreedPayload(payload([{ value: '52', timestamp }])).ok,
      ]).toEqual([timestamp, false])
    expect(FEAR_GREED_EPOCH_MS).toBe(Date.UTC(2018, 0, 1))
  })

  it('rejects the whole payload on one bad row rather than dropping it', () => {
    const result = parseFearGreedPayload(
      payload([
        { value: '52', timestamp: String(T0) },
        { value: 'bad', timestamp: String(T0 - 86400) },
        { value: '50', timestamp: String(T0 - 2 * 86400) },
      ])
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('row 1')
  })

  it('rejects duplicate timestamps', () => {
    const result = parseFearGreedPayload(
      payload([
        { value: '52', timestamp: String(T0) },
        { value: '51', timestamp: String(T0) },
      ])
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('duplicate')
  })

  it('rejects a payload that is not the documented shape', () => {
    expect(parseFearGreedPayload(null).ok).toBe(false)
    expect(parseFearGreedPayload('x').ok).toBe(false)
    expect(parseFearGreedPayload([]).ok).toBe(false)
    expect(parseFearGreedPayload({}).ok).toBe(false)
    expect(parseFearGreedPayload({ data: 'x' }).ok).toBe(false)
    expect(parseFearGreedPayload({ data: [] }).ok).toBe(false)
    expect(parseFearGreedPayload({ data: [null] }).ok).toBe(false)
    expect(parseFearGreedPayload({ data: [{ value: '52' }] }).ok).toBe(false)
  })

  it('does not require metadata to be present', () => {
    expect(
      parseFearGreedPayload({ data: [{ value: '52', timestamp: String(T0) }] })
        .ok
    ).toBe(true)
  })
})

describe('fearGreedDayStartUtc', () => {
  it('floors a reading to 00:00 UTC of its day', () => {
    const noon = Date.UTC(2026, 8, 2, 12, 30)
    expect(fearGreedDayStartUtc(noon)).toBe(Date.UTC(2026, 8, 2))
    expect(fearGreedDayStartUtc(Date.UTC(2026, 8, 2))).toBe(
      Date.UTC(2026, 8, 2)
    )
    expect(fearGreedDayStartUtc(Date.UTC(2026, 8, 2, 23, 59, 59))).toBe(
      Date.UTC(2026, 8, 2)
    )
  })

  it('keeps the source-staleness bound inside a few daily updates', () => {
    expect(FEAR_GREED_MAX_SOURCE_AGE_MS).toBe(3 * DAY_MS)
  })
})
