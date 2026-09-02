type RankableSearchResult = {
  createdTime: number
  importanceScore: number
}

/**
 * Mixes posts into market results without accidentally overriding a ranking
 * that only the market API understands (personalization or lexical relevance).
 */
export const orderCombinedSearchResults = <
  C extends RankableSearchResult,
  P extends RankableSearchResult
>(
  contracts: readonly C[],
  posts: readonly P[],
  options: {
    sort?: string
    preserveContractOrder: boolean
  }
): (C | P)[] => {
  const { sort, preserveContractOrder } = options
  if (
    posts.length === 0 ||
    preserveContractOrder ||
    (sort !== 'score' && sort !== 'newest')
  ) {
    return [...contracts, ...posts]
  }

  const value =
    sort === 'score'
      ? (item: RankableSearchResult) => item.importanceScore
      : (item: RankableSearchResult) => item.createdTime

  return [...contracts, ...posts].sort((a, b) => value(b) - value(a))
}
