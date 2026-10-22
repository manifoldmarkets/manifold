import { Contract } from 'common/contract'
import { uniqBy } from 'lodash'

// One `order by` expression of a search sort, evaluated in JS.
export type SearchSortValue = number | string | null | undefined
export type SearchSortDirection = { order: 'asc' | 'desc'; nullsFirst: boolean }

// A search sort as BOTH sides must apply it: the SQL `order by` that fetches
// each match tier, and the JS that merges those tiers into a page. Keys are
// compared in order, each in its own direction with its own null placement,
// and a tie in all of them falls through to the contract id — the same total
// order the SQL clause ends with (see getSearchContractSortSQL).
export type SearchSort = {
  keys: (contract: Contract) => SearchSortValue[]
  directions: SearchSortDirection[]
}

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

const isNull = (value: SearchSortValue) =>
  value == null || (typeof value === 'number' && Number.isNaN(value))

const compareValues = (
  a: SearchSortValue,
  b: SearchSortValue,
  { order, nullsFirst }: SearchSortDirection
) => {
  if (isNull(a) || isNull(b)) {
    if (isNull(a) && isNull(b)) return 0
    return (isNull(a) ? -1 : 1) * (nullsFirst ? 1 : -1)
  }
  const [left, right] = [a, b] as (number | string)[]
  if (left === right) return 0
  return (left < right ? -1 : 1) * (order === 'asc' ? 1 : -1)
}

/**
 * Sort exactly as the SQL that fetched the rows does.
 *
 * Each match tier arrives as a prefix of its own SQL ordering, and a page is
 * cut from the JS merge of those prefixes. That cut is only the page the
 * database would have produced if JS ranks rows the way SQL does — a JS key
 * that disagrees with SQL (the score sort once ranked zero-importance markets
 * by bettor count among scored ones, which SQL never does) lets a row fetched
 * for a later page leapfrog rows already shown, so one market repeats and
 * another is never seen. `getWeight` scales a match's numeric keys (answer
 * matches count half); string keys are left alone.
 */
export const sortLikeSql = <T>(
  items: T[],
  sort: SearchSort,
  getContract: (item: T) => Contract,
  getWeight: (item: T) => number = () => 1
) => {
  const lastDirection = sort.directions[sort.directions.length - 1]
  const keyed = items.map((item) => {
    const contract = getContract(item)
    const weight = getWeight(item)
    return {
      item,
      id: contract.id,
      keys: sort
        .keys(contract)
        .map((value) => (typeof value === 'number' ? value * weight : value)),
    }
  })
  keyed.sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) {
      const result = compareValues(
        a.keys[i],
        b.keys[i],
        sort.directions[i] ?? lastDirection
      )
      if (result !== 0) return result
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return keyed.map(({ item }) => item)
}

export const getSearchResultPage = (
  matchesInRelevanceOrder: Contract[],
  pagination: SearchPagination & { sort: string; ordering: SearchSort }
) => {
  const { limit, sort, ordering } = pagination
  const offset = getResultOffset(pagination)
  const matches = uniqBy(matchesInRelevanceOrder, 'id')
  const order = (contracts: Contract[]) =>
    sortLikeSql(contracts, ordering, (contract) => contract)
  // The newest-first cursor is the last result's createdTime. Relevance
  // cannot put an older ticker hit on this page ahead of newer title hits,
  // or the next cursor will skip those titles entirely.
  if (sort === 'newest') return order(matches).slice(offset, offset + limit)

  // Other sorts use offsets and retain the existing relevance priority for
  // page membership, then display that page in the requested sort order.
  return order(matches.slice(offset, offset + limit))
}
