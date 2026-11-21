import {
  fullSearchProps,
  getMarketSearchRoute,
  parseSportsDiscoveryCursor,
  searchProps,
  shouldExcludeOfficialSports,
} from './market-search-types'
import { API } from './schema'

describe('searchProps', () => {
  it('accepts PERP as an exact market type filter', () => {
    const result = searchProps.parse({ contractType: 'PERP' })

    expect(result.contractType).toBe('PERP')
  })

  it('accepts a finite browse-session anchor', () => {
    const result = searchProps.parse({
      seenMarketCutoffTime: '1700000000000',
    })

    expect(result.seenMarketCutoffTime).toBe(1_700_000_000_000)
  })

  it('coerces the semantic-search capability flag', () => {
    expect(searchProps.parse({ enableSemanticSearch: 'true' })).toMatchObject({
      enableSemanticSearch: true,
    })
    expect(searchProps.parse({ enableSemanticSearch: 'false' })).toMatchObject({
      enableSemanticSearch: false,
    })
  })

  it('accepts only known discovery experiment variants', () => {
    expect(searchProps.parse({ discoveryVariant: 'control' })).toMatchObject({
      discoveryVariant: 'control',
    })
    expect(searchProps.parse({ discoveryVariant: 'treatment' })).toMatchObject({
      discoveryVariant: 'treatment',
    })
    expect(() => searchProps.parse({ discoveryVariant: 'preview' })).toThrow()
  })
})

describe('official sports discovery', () => {
  it('limits intent and composite cursor to the undocumented full endpoint', () => {
    const query = {
      sort: 'newest',
      sportsDiscovery: 'new',
      sportsDiscoveryCursor: '1700000000000:a_B-5',
    }
    expect(API['search-markets-full'].props.safeParse(query).success).toBe(true)
    expect(API['search-markets'].props.safeParse(query).success).toBe(false)
    expect(API['recent-markets'].props.safeParse(query).success).toBe(false)
    expect(
      fullSearchProps.safeParse({ ...query, sportsDiscovery: 'other' }).success
    ).toBe(false)
    expect(parseSportsDiscoveryCursor(query.sportsDiscoveryCursor)).toEqual({
      beforeTime: 1700000000000,
      beforeId: 'a_B-5',
    })
    for (const cursor of [
      '0:x',
      '01:x',
      'NaN:x',
      '8640000000000000:x',
      '1:/page',
      '1:x\n',
      '1:' + 'x'.repeat(129),
    ])
      expect(
        fullSearchProps.safeParse({ ...query, sportsDiscoveryCursor: cursor })
          .success
      ).toBe(false)
  })
  it('opts in unscoped Home, Browse New and the sitemap', () => {
    expect(
      shouldExcludeOfficialSports({
        sportsDiscovery: 'home',
        sort: 'score',
        forYou: '1',
      })
    ).toBe(true)
    expect(
      shouldExcludeOfficialSports({
        sportsDiscovery: 'home',
        sort: 'daily-score',
      })
    ).toBe(true)
    expect(
      shouldExcludeOfficialSports({ sportsDiscovery: 'new', sort: 'newest' })
    ).toBe(true)
    expect(
      shouldExcludeOfficialSports({ sportsDiscovery: 'sitemap', sort: 'score' })
    ).toBe(true)
    expect(shouldExcludeOfficialSports({ sort: 'newest' })).toBe(false)
    expect(
      shouldExcludeOfficialSports({ sportsDiscovery: 'new', sort: 'score' })
    ).toBe(false)
    expect(
      shouldExcludeOfficialSports({
        sportsDiscovery: 'sitemap',
        sort: 'newest',
      })
    ).toBe(false)
    expect(
      shouldExcludeOfficialSports({
        sportsDiscovery: 'new',
        sort: 'newest',
        forYou: '1',
      })
    ).toBe(false)
  })
  it('keeps explicit market, topic, creator and position searches', () => {
    for (const scope of [
      { term: 'hockey' },
      { topicSlug: 'sports' },
      { topicSlug: 'followed' },
      { gids: 'hockey' },
      { creatorId: 'house' },
      { hasBets: '1' as const },
    ])
      expect(
        shouldExcludeOfficialSports({
          sportsDiscovery: 'home',
          sort: 'newest',
          ...scope,
        })
      ).toBe(false)
  })
})

describe('getMarketSearchRoute', () => {
  const defaultSearch = {
    filter: 'all' as const,
    term: '',
    groupIds: [],
    sort: 'score' as const,
    token: 'MANA' as const,
    isRecent: false,
    isForYou: true,
    userId: 'user-id',
  }

  it('uses the personalized query for an authenticated no-topic search', () => {
    expect(getMarketSearchRoute(defaultSearch)).toBe('for-you')
  })

  it('keeps a topic slug on the filtered search path', () => {
    expect(
      getMarketSearchRoute({
        ...defaultSearch,
        topicSlug: 'science',
      })
    ).toBe('filtered')
  })

  it('keeps resolved parent and subtopic ids on the filtered search path', () => {
    expect(
      getMarketSearchRoute({
        ...defaultSearch,
        groupIds: ['parent-id', 'subtopic-id'],
      })
    ).toBe('filtered')
  })
})

describe('market search caching', () => {
  it.each(['search-markets', 'search-markets-full'] as const)(
    'does not shared-cache auth-sensitive %s results',
    (endpoint) => {
      expect(API[endpoint].cache).toBe('private, no-store')
    }
  )
})
