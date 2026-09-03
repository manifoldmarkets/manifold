import { getMarketSearchRoute, searchProps } from './market-search-types'
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
