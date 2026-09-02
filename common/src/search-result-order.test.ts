import { orderCombinedSearchResults } from './search-result-order'

type Result = {
  id: string
  createdTime: number
  importanceScore: number
}

const result = (
  id: string,
  importanceScore: number,
  createdTime: number
): Result => ({ id, importanceScore, createdTime })

const ids = (results: Result[]) => results.map(({ id }) => id)

describe('orderCombinedSearchResults', () => {
  const lexical = result('lexical', 1, 10)
  const semantic = result('semantic', 100, 20)
  const post = result('post', 50, 30)

  it('keeps lexical results ahead of the semantic tail for score searches', () => {
    const ordered = orderCombinedSearchResults([lexical, semantic], [post], {
      sort: 'score',
      preserveContractOrder: true,
    })

    expect(ids(ordered)).toEqual(['lexical', 'semantic', 'post'])
  })

  it('retains the supplied similarity order within a semantic tail', () => {
    const firstBySimilarity = result('first-by-similarity', 2, 10)
    const secondBySimilarity = result('second-by-similarity', 200, 20)

    const ordered = orderCombinedSearchResults(
      [firstBySimilarity, secondBySimilarity],
      [],
      { sort: 'score', preserveContractOrder: true }
    )

    expect(ids(ordered)).toEqual([
      'first-by-similarity',
      'second-by-similarity',
    ])
  })

  it('does not override personalized contract order when there are no posts', () => {
    const ordered = orderCombinedSearchResults([lexical, semantic], [], {
      sort: 'score',
      preserveContractOrder: false,
    })

    expect(ids(ordered)).toEqual(['lexical', 'semantic'])
  })

  it('still mixes empty-query score results by importance', () => {
    const ordered = orderCombinedSearchResults([semantic, lexical], [post], {
      sort: 'score',
      preserveContractOrder: false,
    })

    expect(ids(ordered)).toEqual(['semantic', 'post', 'lexical'])
  })

  it('still mixes newest results by creation time', () => {
    const ordered = orderCombinedSearchResults([lexical, semantic], [post], {
      sort: 'newest',
      preserveContractOrder: false,
    })

    expect(ids(ordered)).toEqual(['post', 'semantic', 'lexical'])
  })

  it('preserves incoming order for recent results', () => {
    const ordered = orderCombinedSearchResults([semantic, lexical], [post], {
      preserveContractOrder: false,
    })

    expect(ids(ordered)).toEqual(['semantic', 'lexical', 'post'])
  })
})
