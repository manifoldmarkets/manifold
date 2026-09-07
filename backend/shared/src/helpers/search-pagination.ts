import { Contract } from 'common/contract'
import { orderBy, uniqBy } from 'lodash'

type SearchPagination = {
  limit: number
  offset: number
  beforeTime?: number
}

const getResultOffset = ({ offset, beforeTime }: SearchPagination) =>
  beforeTime ? 0 : offset

// Each lookup must include the candidates that earlier pages consumed from
// any match type. Applying the offset independently skips displaced matches.
export const getSearchQueryPagination = (pagination: SearchPagination) => ({
  limit: getResultOffset(pagination) + pagination.limit,
  offset: 0,
})

export const getSearchResultPage = (
  matchesInRelevanceOrder: Contract[],
  pagination: SearchPagination & {
    sort: string
    sortCallback: (contract: Contract) => number
    order: 'asc' | 'desc'
  }
) => {
  const { limit, sort, sortCallback, order } = pagination
  const offset = getResultOffset(pagination)
  const matches = uniqBy(matchesInRelevanceOrder, 'id')
  // The newest-first cursor is the last result's createdTime. Relevance
  // cannot put an older ticker hit on this page ahead of newer title hits,
  // or the next cursor will skip those titles entirely.
  if (sort === 'newest')
    return orderBy(matches, sortCallback, order).slice(offset, offset + limit)

  // Other sorts use offsets and retain the existing relevance priority for
  // page membership, then display that page in the requested sort order.
  return orderBy(matches.slice(offset, offset + limit), sortCallback, order)
}
