import {
  MAX_BOND_CROSS_CHECK_GAP_FRAC,
  MIN_BOND_WINDOW_VOLUME_PER_SIDE,
  OSRS_BOND_ITEM_ID,
  checkBondAgainstGuidePrice,
  isPlausibleBondGp,
  parseJagexGuidePriceGp,
  parseOsrsBondTimeseries,
  parseOsrsBondWindow,
  readJagexGuidePriceGp,
} from './osrs-bond'

const WINDOW_START_SECONDS = 1_757_548_800
const FIVE_MINUTES = 300

// A healthy window at roughly September 2026 levels: 12.20M instant-buy,
// 11.83M instant-sell, so a 12.015M midpoint on a ~3% spread.
const healthyPayload = (overrides: Record<string, unknown> = {}) => ({
  data: {
    [String(OSRS_BOND_ITEM_ID)]: {
      avgHighPrice: 12_200_000,
      highPriceVolume: 120,
      avgLowPrice: 11_830_000,
      lowPriceVolume: 96,
      ...overrides,
    },
  },
  timestamp: WINDOW_START_SECONDS,
})

describe('parseOsrsBondWindow', () => {
  it('prices the window at the unweighted midpoint', () => {
    const result = parseOsrsBondWindow(healthyPayload(), FIVE_MINUTES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The midpoint, NOT a volume-weighted average: buy-side volume exceeds
    // sell-side here, and a VWAP would drag the mark toward the ask for no
    // reason other than flow mix.
    expect(result.window.price).toBe(12_015_000)
    expect(result.window.avgHighPrice).toBe(12_200_000)
    expect(result.window.avgLowPrice).toBe(11_830_000)
  })

  it('stamps the observation at the window end and the source at its start', () => {
    const result = parseOsrsBondWindow(healthyPayload(), FIVE_MINUTES)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.windowStartMs).toBe(WINDOW_START_SECONDS * 1000)
    expect(result.window.windowEndMs).toBe(
      (WINDOW_START_SECONDS + FIVE_MINUTES) * 1000
    )
  })

  it('uses the window length it is given', () => {
    // The payload does not say how long its window is, so an hourly window has
    // to be stamped an hour after its start, not five minutes.
    const result = parseOsrsBondWindow(healthyPayload(), 3_600)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.windowEndMs).toBe(
      (WINDOW_START_SECONDS + 3_600) * 1000
    )
  })

  it('skips a one-sided window rather than calling it corrupt', () => {
    // Routine on a quiet five minutes: the midpoint is undefined without both
    // sides, so the feed publishes nothing and the mark ages.
    const result = parseOsrsBondWindow(
      healthyPayload({ avgLowPrice: null, lowPriceVolume: 0 }),
      FIVE_MINUTES
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('one-sided')
    // Routine, so it must NOT be the severity the oracle tick alerts on.
    expect(result.kind).toBe('quiet')
  })

  it('rejects a crossed window', () => {
    // Instant-buy below instant-sell cannot happen in the Grand Exchange's
    // own mechanics, so the payload is wrong.
    const result = parseOsrsBondWindow(
      healthyPayload({ avgHighPrice: 11_000_000, avgLowPrice: 12_000_000 }),
      FIVE_MINUTES
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('crossed')
    expect(result.kind).toBe('invalid')
  })

  it('rejects a window too thin for its midpoint to mean anything', () => {
    const result = parseOsrsBondWindow(
      healthyPayload({ lowPriceVolume: MIN_BOND_WINDOW_VOLUME_PER_SIDE - 1 }),
      FIVE_MINUTES
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('too thin')
    // A quiet market, not a broken one: nobody should be woken for it.
    expect(result.kind).toBe('quiet')
  })

  it('accepts a window exactly at the volume floor', () => {
    const result = parseOsrsBondWindow(
      healthyPayload({
        highPriceVolume: MIN_BOND_WINDOW_VOLUME_PER_SIDE,
        lowPriceVolume: MIN_BOND_WINDOW_VOLUME_PER_SIDE,
      }),
      FIVE_MINUTES
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a dislocated spread', () => {
    // 8M/12M is a 40% gap: the midpoint of that pair is a price nobody traded.
    const result = parseOsrsBondWindow(
      healthyPayload({ avgHighPrice: 12_000_000, avgLowPrice: 8_000_000 }),
      FIVE_MINUTES
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('spread')
    expect(result.kind).toBe('invalid')
  })

  it('accepts the bond’s normal ~3% spread', () => {
    const result = parseOsrsBondWindow(healthyPayload(), FIVE_MINUTES)
    expect(result.ok).toBe(true)
  })

  it('rejects a midpoint outside the plausible band', () => {
    // The whole payload in millions instead of gp — the unit mistake the band
    // exists for.
    const result = parseOsrsBondWindow(
      healthyPayload({ avgHighPrice: 12, avgLowPrice: 11 }),
      FIVE_MINUTES
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('outside plausible')
  })

  it('accepts the decimal strings a provider might start serving', () => {
    const result = parseOsrsBondWindow(
      healthyPayload({ avgHighPrice: '12200000', highPriceVolume: '120' }),
      FIVE_MINUTES
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.window.price).toBe(12_015_000)
  })

  it('rejects non-integer gp prices', () => {
    // Grand Exchange prices are whole gp; a fractional one means the number
    // has been through an averaging step we did not do.
    const result = parseOsrsBondWindow(
      healthyPayload({ avgHighPrice: 12_200_000.5 }),
      FIVE_MINUTES
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('unusable averages')
  })

  it.each([
    ['a non-object payload', 'nope'],
    ['a null payload', null],
    ['a missing data object', { timestamp: WINDOW_START_SECONDS }],
    [
      'a missing item row',
      { data: { '4151': {} }, timestamp: WINDOW_START_SECONDS },
    ],
    ['a missing timestamp', { data: { [String(OSRS_BOND_ITEM_ID)]: {} } }],
    [
      'a zero timestamp',
      { data: { [String(OSRS_BOND_ITEM_ID)]: {} }, timestamp: 0 },
    ],
  ])('rejects %s', (_label, body) => {
    const result = parseOsrsBondWindow(body, FIVE_MINUTES)
    expect(result.ok).toBe(false)
  })

  it('rejects a nonsense window length instead of computing a stamp from it', () => {
    expect(parseOsrsBondWindow(healthyPayload(), 0).ok).toBe(false)
    expect(parseOsrsBondWindow(healthyPayload(), -300).ok).toBe(false)
    expect(parseOsrsBondWindow(healthyPayload(), 1.5).ok).toBe(false)
  })
})

describe('parseJagexGuidePriceGp', () => {
  it.each([
    ['12200000', 12_200_000],
    ['12,200,000', 12_200_000],
    ['12.2m', 12_200_000],
    ['12.2M', 12_200_000],
    ['900.5k', 900_500],
    ['2.1b', 2_100_000_000],
    ['2,000', 2_000],
    [' 12.2m ', 12_200_000],
  ])('parses %s', (raw, expected) => {
    expect(parseJagexGuidePriceGp(raw)).toBe(expected)
  })

  it('parses a plain number', () => {
    expect(parseJagexGuidePriceGp(12_200_000)).toBe(12_200_000)
  })

  it.each([
    ['a negative daily move', '- 50.0k'],
    ['a zero sentinel', 0],
    ['a zero string', '0'],
    ['an empty string', ''],
    ['a unit we do not know', '12.2t'],
    ['prose', 'unknown'],
    ['an object', {}],
    ['null', null],
  ])('rejects %s', (_label, raw) => {
    expect(parseJagexGuidePriceGp(raw)).toBeNull()
  })
})

describe('readJagexGuidePriceGp', () => {
  const payload = (overrides: Record<string, unknown> = {}) => ({
    item: {
      id: OSRS_BOND_ITEM_ID,
      name: 'Old school bond',
      current: { trend: 'neutral', price: '12.2m' },
      today: { trend: 'neutral', price: 0 },
      ...overrides,
    },
  })

  it('reads the current guide price', () => {
    expect(readJagexGuidePriceGp(payload())).toBe(12_200_000)
  })

  it('refuses a payload for a different item', () => {
    // A guide price for the wrong item would be two different markets being
    // called consistent — the exact failure a cross-check exists to catch.
    expect(readJagexGuidePriceGp(payload({ id: 4151 }))).toBeNull()
  })

  it.each([
    ['a missing item', {}],
    ['a missing current block', { item: { id: OSRS_BOND_ITEM_ID } }],
    [
      'an implausible price',
      { item: { id: OSRS_BOND_ITEM_ID, current: { price: '12' } } },
    ],
    ['a non-object', 'nope'],
  ])('rejects %s', (_label, body) => {
    expect(readJagexGuidePriceGp(body)).toBeNull()
  })
})

describe('checkBondAgainstGuidePrice', () => {
  it('accepts a lagging guide price', () => {
    // Jagex's number trails by a day or more; a 10% gap is normal weather.
    expect(checkBondAgainstGuidePrice(12_015_000, 13_000_000)).toBeNull()
  })

  it('rejects a structural disagreement', () => {
    const rejection = checkBondAgainstGuidePrice(12_015_000, 4_000_000)
    expect(rejection).toContain('cross-check tolerance')
  })

  it('measures the gap against the independent quantity', () => {
    // Relative to the GUIDE price, so a wildly wrong candidate cannot shrink
    // its own apparent error by being the denominator.
    const guide = 10_000_000
    const gapFrac = MAX_BOND_CROSS_CHECK_GAP_FRAC
    expect(checkBondAgainstGuidePrice(guide * (1 + gapFrac), guide)).toBeNull()
    expect(
      checkBondAgainstGuidePrice(guide * (1 + gapFrac) + 1, guide)
    ).not.toBeNull()
  })

  it('fails OPEN when there is no guide price', () => {
    // Jagex being unreachable is not evidence about the bond's price, and
    // freezing a market on their outage would make it our incident.
    expect(checkBondAgainstGuidePrice(12_015_000, null)).toBeNull()
  })

  it('rejects invalid inputs rather than treating them as agreement', () => {
    expect(checkBondAgainstGuidePrice(Number.NaN, 12_000_000)).not.toBeNull()
    expect(checkBondAgainstGuidePrice(0, 12_000_000)).not.toBeNull()
    expect(checkBondAgainstGuidePrice(12_015_000, 0)).not.toBeNull()
  })
})

describe('parseOsrsBondTimeseries', () => {
  const row = (timestamp: number, overrides: Record<string, unknown> = {}) => ({
    timestamp,
    avgHighPrice: 12_200_000,
    highPriceVolume: 120,
    avgLowPrice: 11_830_000,
    lowPriceVolume: 96,
    ...overrides,
  })

  it('returns every usable window, oldest first', () => {
    const result = parseOsrsBondTimeseries(
      {
        data: [
          row(WINDOW_START_SECONDS + 300),
          row(WINDOW_START_SECONDS),
          row(WINDOW_START_SECONDS + 600, { avgHighPrice: 12_400_000 }),
        ],
      },
      FIVE_MINUTES
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.windows.map((w) => w.windowStartMs)).toEqual([
      WINDOW_START_SECONDS * 1000,
      (WINDOW_START_SECONDS + 300) * 1000,
      (WINDOW_START_SECONDS + 600) * 1000,
    ])
    expect(result.skipped).toEqual([])
  })

  it('validates rows by exactly the live feed\u2019s rules', () => {
    // A backfill validated more loosely than the feed would seed history the
    // feed itself would never have published.
    const result = parseOsrsBondTimeseries(
      {
        data: [
          row(WINDOW_START_SECONDS),
          row(WINDOW_START_SECONDS + 300, { avgLowPrice: null }),
          row(WINDOW_START_SECONDS + 600, { lowPriceVolume: 1 }),
          row(WINDOW_START_SECONDS + 900, { avgLowPrice: 8_000_000 }),
        ],
      },
      FIVE_MINUTES
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.windows).toHaveLength(1)
    expect(result.skipped).toHaveLength(3)
  })

  it('skips a row rather than failing the batch', () => {
    // The opposite of the Fear & Greed parser's all-or-nothing stance, because
    // a quiet window is normal over a year and dropping it reproduces what the
    // live feed did; rejecting the batch would mean no history at all.
    const result = parseOsrsBondTimeseries(
      { data: ['nonsense', row(WINDOW_START_SECONDS)] },
      FIVE_MINUTES
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.windows).toHaveLength(1)
    expect(result.skipped[0]).toContain('row 0')
  })

  it('fails when no row is usable', () => {
    const result = parseOsrsBondTimeseries(
      { data: [row(WINDOW_START_SECONDS, { avgLowPrice: null })] },
      FIVE_MINUTES
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('no usable window')
  })

  it.each([
    ['a non-array data', { data: {} }],
    ['a missing data', {}],
    ['a non-object payload', 'nope'],
  ])('rejects %s', (_label, body) => {
    expect(parseOsrsBondTimeseries(body, FIVE_MINUTES).ok).toBe(false)
  })
})

describe('isPlausibleBondGp', () => {
  it('covers the bond’s whole traded history', () => {
    // ~2M gp in 2015 through the 16.4M January 2026 high.
    for (const gp of [2_000_000, 12_015_000, 16_400_000]) {
      expect(isPlausibleBondGp(gp)).toBe(true)
    }
  })

  it('catches unit confusion', () => {
    expect(isPlausibleBondGp(12.2)).toBe(false)
    expect(isPlausibleBondGp(12_200)).toBe(false)
    expect(isPlausibleBondGp(0)).toBe(false)
    expect(isPlausibleBondGp(Number.NaN)).toBe(false)
  })
})
