import { PerpContract } from 'common/contract'
import { getPerpQuote, isNewerPerpQuote, perpQuoteSchema } from './quote'

// Minimal stand-in for the live fields getPerpQuote reads. The rest of
// PerpContract is irrelevant here and deliberately not modelled.
const contract = (overrides: Partial<PerpContract> = {}) =>
  ({
    id: 'c1',
    oraclePrice: 64_875.4,
    poolLong: 1_000,
    poolShort: 900,
    ...overrides,
  } as PerpContract)

describe('isNewerPerpQuote', () => {
  it('accepts a strictly newer observation and rejects older or equal ones', () => {
    expect(isNewerPerpQuote(1_000, 1_001)).toBe(true)
    expect(isNewerPerpQuote(1_000, 999)).toBe(false)
    // Equal means the same observation — a retry or a replay after reconnect,
    // not new information.
    expect(isNewerPerpQuote(1_000, 1_000)).toBe(false)
  })

  it('never lets an untimed quote displace a timed one', () => {
    // A quote with no timestamp cannot be proven newer, so it must lose. This
    // is what stops a body with a missing time from rewinding a live price.
    expect(isNewerPerpQuote(1_000, undefined)).toBe(false)
    expect(isNewerPerpQuote(1_000, null)).toBe(false)
  })

  it('accepts any timed quote over an untimed baseline', () => {
    expect(isNewerPerpQuote(undefined, 1_000)).toBe(true)
    expect(isNewerPerpQuote(null, 1_000)).toBe(true)
  })

  it('treats undefined and null as the same absent baseline', () => {
    expect(isNewerPerpQuote(undefined, undefined)).toBe(true)
    expect(isNewerPerpQuote(null, null)).toBe(true)
    expect(isNewerPerpQuote(null, undefined)).toBe(true)
  })

  it('orders on market time, not arrival order', () => {
    // The scheduler pushes fire-and-forget and the fallback poll races them,
    // so a tick can arrive after a newer one. Applying in arrival order would
    // visibly rewind the price; applying in market time cannot.
    const arrivals = [1_003, 1_001, 1_002]
    let applied: number | undefined
    for (const ts of arrivals) {
      if (isNewerPerpQuote(applied, ts)) applied = ts
    }
    expect(applied).toBe(1_003)
  })
})

describe('getPerpQuote', () => {
  it('extracts the live slice of a contract', () => {
    expect(
      getPerpQuote(
        contract({ oraclePriceTime: 1_700, oracleSourceTime: 1_650 })
      )
    ).toEqual({
      contractId: 'c1',
      oraclePrice: 64_875.4,
      poolLong: 1_000,
      poolShort: 900,
      oraclePriceTime: 1_700,
      oracleSourceTime: 1_650,
    })
  })

  it('omits absent optionals rather than emitting undefined keys', () => {
    // An explicit `oraclePriceTime: undefined` would spread over a client's
    // existing value and blank it; the key must simply be absent.
    const quote = getPerpQuote(contract())
    expect('oraclePriceTime' in quote).toBe(false)
    expect('oracleSourceTime' in quote).toBe(false)
  })

  it('omits a null source time', () => {
    // oracleSourceTime is `number | null` on the contract — null means the
    // feed declared no source timestamp, which is not a value worth sending.
    const quote = getPerpQuote(
      contract({ oraclePriceTime: 1_700, oracleSourceTime: null })
    )
    expect('oracleSourceTime' in quote).toBe(false)
  })

  it('produces a payload the internal broadcast endpoint accepts', () => {
    // The quote crosses a process boundary and is re-validated on arrival, so
    // the extractor and the wire schema must not drift apart.
    const quote = getPerpQuote(
      contract({ oraclePriceTime: 1_700, oracleSourceTime: 1_650 })
    )
    expect(perpQuoteSchema.safeParse(quote).success).toBe(true)
    expect(perpQuoteSchema.safeParse(getPerpQuote(contract())).success).toBe(
      true
    )
  })

  it('rejects a non-finite price at the wire boundary', () => {
    // Defensive: a NaN price reaching the client would render as a broken
    // position value rather than failing loudly at the edge.
    expect(
      perpQuoteSchema.safeParse({
        ...getPerpQuote(contract({ oraclePriceTime: 1_700 })),
        oraclePrice: Number.NaN,
      }).success
    ).toBe(false)
  })

  it('rejects unknown fields so the quote cannot smuggle contract state', () => {
    expect(
      perpQuoteSchema.safeParse({
        ...getPerpQuote(contract({ oraclePriceTime: 1_700 })),
        isResolved: true,
      }).success
    ).toBe(false)
  })
})
