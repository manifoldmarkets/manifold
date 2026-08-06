import { getMarketSearchRoute, searchProps } from './market-search-types'

describe('searchProps', () => {
  it('accepts PERP as an exact market type filter', () => {
    const result = searchProps.parse({ contractType: 'PERP' })

    expect(result.contractType).toBe('PERP')
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
