import {
  SURFACE_TRADE_EVENT,
  SurfaceEventRow,
  classifySurfaceEvent,
  computeSurfaceFunnels,
  getStatSurface,
  getSurfaceVisitorIds,
  parseSurfaceFunnels,
} from './stat-surfaces'

const row = (
  userId: string,
  tsMs: number,
  name: string,
  extra: Partial<SurfaceEventRow> = {}
): SurfaceEventRow => ({
  userId,
  tsMs,
  name,
  topic: null,
  funnel: null,
  ...extra,
})

const pill = (userId: string, tsMs: number, topic: string) =>
  row(userId, tsMs, 'select search topic', { topic })
const trade = (userId: string, tsMs: number, funnel: string) =>
  row(userId, tsMs, SURFACE_TRADE_EVENT, { funnel })

describe('getStatSurface', () => {
  it('matches a surface path and its subpaths', () => {
    expect(getStatSurface('/sports')).toBe('sports')
    expect(getStatSurface('/sports/nfl')).toBe('sports')
    expect(getStatSurface('/election')).toBe('midterms')
    expect(getStatSurface('/election/new-york/senate')).toBe('midterms')
    expect(getStatSurface('/perps')).toBe('perps')
  })

  it('does not match other pages or lookalike prefixes', () => {
    expect(getStatSurface('/')).toBeUndefined()
    expect(getStatSurface('/home')).toBeUndefined()
    expect(getStatSurface('/sportsbook')).toBeUndefined()
    expect(getStatSurface('/elections')).toBeUndefined()
    expect(getStatSurface('/someone/a-sports-market')).toBeUndefined()
  })
})

describe('classifySurfaceEvent', () => {
  it('maps pills by their topic, not where they were clicked', () => {
    expect(classifySurfaceEvent(pill('u', 1, 'midterms-2026'))?.surface).toBe(
      'midterms'
    )
    expect(
      classifySurfaceEvent(
        row('u', 1, 'select search topic', {
          topic: 'perps',
          funnel: 'sports',
        })
      )
    ).toMatchObject({ kind: 'pill', surface: 'perps' })
    expect(classifySurfaceEvent(pill('u', 1, 'politics'))).toBeUndefined()
  })

  it('counts tagged views and the legacy page-view names', () => {
    expect(
      classifySurfaceEvent(row('u', 1, 'view /sports/ncaaf'))
    ).toMatchObject({ kind: 'view', surface: 'sports' })
    expect(
      classifySurfaceEvent(row('u', 1, 'view us midterms page 2026'))?.surface
    ).toBe('midterms')
    expect(
      classifySurfaceEvent(
        row('u', 1, 'view election section', { funnel: 'midterms' })
      )?.surface
    ).toBe('midterms')
    expect(classifySurfaceEvent(row('u', 1, 'view home'))).toBeUndefined()
  })

  it('ignores trades without a known surface and non-view events', () => {
    expect(classifySurfaceEvent(trade('u', 1, 'casino'))).toBeUndefined()
    expect(
      classifySurfaceEvent(row('u', 1, 'bet intent', { funnel: 'sports' }))
    ).toBeUndefined()
  })
})

describe('computeSurfaceFunnels', () => {
  const rows = [
    // a: pill, visit, then trade on sports
    pill('a', 100, 'sports'),
    row('a', 101, 'view /sports'),
    trade('a', 110, 'sports'),
    trade('a', 120, 'sports'),
    // b: visits sports, trades elsewhere
    row('b', 105, 'view /sports/soccer'),
    // c: traded on sports before clicking the pill; no page view landed
    trade('c', 150, 'sports'),
    pill('c', 200, 'sports'),
    // d: midterms visit only, clicked the pill twice
    pill('d', 10, 'midterms-2026'),
    pill('d', 20, 'midterms-2026'),
    row('d', 30, 'view us midterms page 2026'),
    // e: ignored event names
    row('e', 1, 'view home'),
    row('e', 2, 'bet intent', { funnel: 'sports' }),
  ]

  it('builds each surface funnel', () => {
    const tradedAnywhere = new Set(['a', 'b', 'c', 'z'])
    const funnels = computeSurfaceFunnels(rows, tradedAnywhere)
    expect(funnels.sports).toEqual({
      pillUsers: 2,
      visitors: 3,
      tradedAnywhere: 3,
      tradedHere: 2,
      trades: 3,
      pillTraded: 1,
    })
    expect(funnels.midterms).toEqual({
      pillUsers: 1,
      visitors: 1,
      tradedAnywhere: 0,
      tradedHere: 0,
      trades: 0,
      pillTraded: 0,
    })
    expect(funnels.perps).toEqual({
      pillUsers: 0,
      visitors: 0,
      tradedAnywhere: 0,
      tradedHere: 0,
      trades: 0,
      pillTraded: 0,
    })
  })

  it('reports trade counts as unknown on days before events were tagged', () => {
    const untagged = rows.filter((r) => r.funnel == null)
    const funnels = computeSurfaceFunnels(untagged, new Set(['a']))
    expect(funnels.sports).toEqual({
      pillUsers: 2,
      visitors: 2,
      tradedAnywhere: 1,
      tradedHere: null,
      trades: null,
      pillTraded: null,
    })
  })

  it('counts zero trades on a tagged day where nobody traded', () => {
    const funnels = computeSurfaceFunnels(
      [
        pill('a', 1, 'perps'),
        row('a', 2, 'view perps page', { funnel: 'perps' }),
      ],
      new Set()
    )
    expect(funnels.perps).toEqual({
      pillUsers: 1,
      visitors: 1,
      tradedAnywhere: 0,
      tradedHere: 0,
      trades: 0,
      pillTraded: 0,
    })
    expect(funnels.sports.tradedHere).toBe(0)
  })

  it('looks up trades for every visitor, including trade-only ones', () => {
    expect(getSurfaceVisitorIds(rows).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('parseSurfaceFunnels', () => {
  const day = {
    pillUsers: 4,
    visitors: 9,
    tradedAnywhere: 6,
    tradedHere: 3,
    trades: 5,
    pillTraded: 2,
  }

  it('reads a stored value', () => {
    const json = { sports: day, midterms: day, perps: { ...day, trades: null } }
    expect(parseSurfaceFunnels(json)).toEqual({
      sports: day,
      midterms: day,
      perps: { ...day, trades: null },
    })
  })

  it('rejects a value that is not an object', () => {
    expect(parseSurfaceFunnels(null)).toBeUndefined()
    expect(parseSurfaceFunnels([])).toBeUndefined()
    expect(parseSurfaceFunnels('sports')).toBeUndefined()
  })

  it('drops only the surfaces that are missing or malformed', () => {
    expect(parseSurfaceFunnels({ sports: day, midterms: day })).toEqual({
      sports: day,
      midterms: day,
    })
    expect(
      parseSurfaceFunnels({
        sports: { ...day, visitors: NaN },
        midterms: [day],
        perps: day,
      })
    ).toEqual({ perps: day })
    expect(
      parseSurfaceFunnels({
        sports: { ...day, tradedHere: -1 },
        midterms: day,
        perps: day,
      })?.sports?.tradedHere
    ).toBeNull()
  })
})
