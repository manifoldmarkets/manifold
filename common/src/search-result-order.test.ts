import {
  getPostSearchThreshold,
  orderCombinedSearchResults,
} from './search-result-order'

type Result = {
  id: string
  createdTime: number
  importanceScore: number
  searchMatchType?: 'lexical' | 'semantic'
}

const result = (
  id: string,
  importanceScore: number,
  createdTime: number,
  searchMatchType?: 'lexical' | 'semantic'
): Result => ({ id, importanceScore, createdTime, searchMatchType })

const ids = (results: Result[]) => results.map(({ id }) => id)

describe('orderCombinedSearchResults', () => {
  const lexical = result('lexical', 1, 10, 'lexical')
  const semantic = result('semantic', 100, 20, 'semantic')
  const post = result('post', 50, 30)

  it('keeps the lexical/post block ahead of the semantic tail', () => {
    const ordered = orderCombinedSearchResults([lexical, semantic], [post], {
      sort: 'score',
      preserveUnmarkedContractOrder: true,
    })

    expect(ids(ordered)).toEqual(['post', 'lexical', 'semantic'])
  })

  it('retains the supplied similarity order within a semantic tail', () => {
    const firstBySimilarity = result('first-by-similarity', 2, 10, 'semantic')
    const secondBySimilarity = result(
      'second-by-similarity',
      200,
      20,
      'semantic'
    )

    const ordered = orderCombinedSearchResults(
      [firstBySimilarity, secondBySimilarity],
      [post],
      { sort: 'score', preserveUnmarkedContractOrder: true }
    )

    expect(ids(ordered)).toEqual([
      'post',
      'first-by-similarity',
      'second-by-similarity',
    ])
  })

  it('retains semantic classification after client filtering removes lexical rows', () => {
    const ordered = orderCombinedSearchResults([semantic], [post], {
      sort: 'score',
      preserveUnmarkedContractOrder: true,
    })

    expect(ids(ordered)).toEqual(['post', 'semantic'])
  })

  it('does not override personalized contract order when there are no posts', () => {
    const ordered = orderCombinedSearchResults([lexical, semantic], [], {
      sort: 'score',
    })

    expect(ids(ordered)).toEqual(['lexical', 'semantic'])
  })

  it('still mixes empty-query score results by importance', () => {
    const highMarket = result('high-market', 100, 20)
    const ordered = orderCombinedSearchResults([lexical, highMarket], [post], {
      sort: 'score',
    })

    expect(ids(ordered)).toEqual(['high-market', 'post', 'lexical'])
  })

  it('interleaves posts when semantic fallback returns no results', () => {
    const higherLexical = result('higher-lexical', 100, 20, 'lexical')
    const ordered = orderCombinedSearchResults(
      [lexical, higherLexical],
      [post],
      { sort: 'score', preserveUnmarkedContractOrder: true }
    )

    expect(ids(ordered)).toEqual(['higher-lexical', 'post', 'lexical'])
  })

  it('interleaves a post across accumulated lexical pages', () => {
    const accumulatedMarkets = Array.from({ length: 40 }, (_, index) =>
      result(`market-${index}`, 100 - index * 2, index, 'lexical')
    )
    const ordered = orderCombinedSearchResults(accumulatedMarkets, [post], {
      sort: 'score',
      preserveUnmarkedContractOrder: true,
    })

    expect(ids(ordered).indexOf('post')).toBe(26)
    expect(ids(ordered).indexOf('market-39')).toBe(40)
  })

  it('fails safe for an unmarked response from an old API worker', () => {
    const oldLexical = result('old-lexical', 1, 10)
    const unknownTail = result('unknown-tail', 100, 20)
    const ordered = orderCombinedSearchResults(
      [oldLexical, unknownTail],
      [post],
      { sort: 'score', preserveUnmarkedContractOrder: true }
    )

    expect(ids(ordered)).toEqual(['old-lexical', 'unknown-tail', 'post'])
  })

  it('still mixes newest results by creation time', () => {
    const ordered = orderCombinedSearchResults([lexical, semantic], [post], {
      sort: 'newest',
    })

    expect(ids(ordered)).toEqual(['post', 'semantic', 'lexical'])
  })

  it('preserves incoming order for recent results', () => {
    const ordered = orderCombinedSearchResults([semantic, lexical], [post], {})

    expect(ids(ordered)).toEqual(['semantic', 'lexical', 'post'])
  })
})

describe('getPostSearchThreshold', () => {
  it('ignores semantic importance scores when finding the lexical floor', () => {
    const lexical = result('lexical', 10, 10)
    const semantic = result('semantic', 1, 20, 'semantic')

    expect(getPostSearchThreshold([lexical, semantic], 'score')).toBe(10)
  })

  it('has no score threshold when only semantic markets remain', () => {
    const semantic = result('semantic', 1, 20, 'semantic')

    expect(getPostSearchThreshold([semantic], 'score')).toBeUndefined()
  })

  it('uses all finite creation times for newest ordering', () => {
    const first = result('first', 10, 30)
    const second = result('second', 20, 20, 'semantic')

    expect(getPostSearchThreshold([first, second], 'newest')).toBe(20)
  })
})
