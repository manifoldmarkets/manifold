import type { FullMarketSearchResult } from './api/market-search-types'

type RankableSearchResult = {
  createdTime: number
  importanceScore: number
}

type RankableMarketSearchResult = RankableSearchResult & {
  searchMatchType?: FullMarketSearchResult['searchMatchType']
}

export const shouldPreserveBackendMarketOrder = (
  discoveryVariant: 'control' | 'treatment' | undefined,
  query: string,
  isForYou: boolean
) => discoveryVariant === 'treatment' && (isForYou || query.trim().length > 0)

export const getPostSearchThreshold = <C extends RankableMarketSearchResult>(
  contracts: readonly C[],
  sort: 'score' | 'newest'
): number | undefined => {
  // Semantic results are similarity-ranked, so their importance scores cannot
  // define the next lexical/post page boundary.
  const rankableContracts =
    sort === 'score'
      ? contracts.filter(
          ({ searchMatchType }) => searchMatchType !== 'semantic'
        )
      : contracts
  const values = rankableContracts
    .map((contract) =>
      sort === 'score' ? contract.importanceScore : contract.createdTime
    )
    .filter(Number.isFinite)

  return values.length === 0 ? undefined : Math.min(...values)
}

/**
 * Mixes posts into market results without accidentally overriding a ranking
 * that only the market API understands (personalization or lexical relevance).
 */
export const orderCombinedSearchResults = <
  C extends RankableMarketSearchResult,
  P extends RankableSearchResult
>(
  contracts: readonly C[],
  posts: readonly P[],
  options: {
    sort?: string
    preserveBackendMarketOrder?: boolean
  }
): (C | P)[] => {
  const { sort, preserveBackendMarketOrder } = options
  if (sort !== 'score' && sort !== 'newest') {
    return [...contracts, ...posts]
  }

  // The treatment API can return an order the client cannot reconstruct
  // (For You personalization or lexical relevance). With no posts to mix in,
  // keep that order intact. Control intentionally falls through to the legacy
  // client-side sort so its behavior remains the pre-experiment baseline.
  if (posts.length === 0 && preserveBackendMarketOrder) {
    return [...contracts]
  }

  if (sort === 'newest') {
    return [...contracts, ...posts].sort(
      (a, b) => b.createdTime - a.createdTime
    )
  }

  // During a rolling deployment, an old API worker can return an unmarked
  // lexical-plus-semantic array to a marker-aware UI. Preserve that array's
  // order rather than risk promoting its unknown semantic tail. New workers
  // mark every text-search market, including lexical-only responses.
  if (
    preserveBackendMarketOrder &&
    contracts.some(({ searchMatchType }) => searchMatchType === undefined)
  ) {
    return [...contracts, ...posts]
  }

  const lexicalContracts = contracts.filter(
    ({ searchMatchType }) => searchMatchType !== 'semantic'
  )
  const semanticContracts = contracts.filter(
    ({ searchMatchType }) => searchMatchType === 'semantic'
  )
  const rankedLexicalResults = [...lexicalContracts, ...posts].sort(
    (a, b) => b.importanceScore - a.importanceScore
  )

  return [...rankedLexicalResults, ...semanticContracts]
}
