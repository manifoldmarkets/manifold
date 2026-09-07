import { Contract } from 'common/contract'
import {
  getSearchQueryPagination,
  getSearchResultPage,
} from './search-pagination'

const market = (id: string, createdTime: number) =>
  ({ id, createdTime } as Contract)

const ticker = market('ticker-only', 1)
const titles = Array.from({ length: 5 }, (_, i) =>
  market(`title-${i + 1}`, 10 - i)
)

const defaults = {
  limit: 2,
  offset: 0,
  sort: 'newest',
  sortCallback: (contract: Contract) => contract.createdTime,
  order: 'desc' as const,
}

// Simulate the existing per-type SQL lookups: each filters by the cursor and
// applies its own limit/offset before the API merges the returned matches.
const search = (pagination: typeof defaults & { beforeTime?: number }) => {
  const query = getSearchQueryPagination(pagination)
  const candidates = [[ticker], titles, titles].flatMap((matches) =>
    matches
      .filter(
        (contract) =>
          pagination.beforeTime === undefined ||
          contract.createdTime < pagination.beforeTime
      )
      .slice(query.offset, query.offset + query.limit)
  )
  return getSearchResultPage(candidates, pagination)
}

describe('search pagination across ticker and title matches', () => {
  it('does not let an old ticker advance the newest-first cursor', () => {
    const first = search(defaults)
    expect(first.map((contract) => contract.id)).toEqual(['title-1', 'title-2'])

    const second = search({ ...defaults, beforeTime: first[1].createdTime })
    expect(second.map((contract) => contract.id)).toEqual([
      'title-3',
      'title-4',
    ])

    const third = search({ ...defaults, beforeTime: second[1].createdTime })
    expect(third.map((contract) => contract.id)).toEqual([
      'title-5',
      'ticker-only',
    ])
  })

  it('returns every match exactly once across offset pages', () => {
    const pages = [0, 2, 4].flatMap((offset) => search({ ...defaults, offset }))
    expect(pages.map((contract) => contract.id)).toEqual([
      ...titles.map((contract) => contract.id),
      ticker.id,
    ])
    expect(search({ ...defaults, offset: 6 })).toEqual([])
  })

  it('preserves relevance priority without losing displaced title matches', () => {
    const pagination = { ...defaults, sort: 'score' }
    expect(search(pagination).map((contract) => contract.id)).toEqual([
      'title-1',
      'ticker-only',
    ])
    const rest = [2, 4].flatMap((offset) => search({ ...pagination, offset }))
    expect(rest.map((contract) => contract.id)).toEqual([
      'title-2',
      'title-3',
      'title-4',
      'title-5',
    ])
  })

  it('ignores the offset when a time cursor is supplied', () => {
    const pagination = { ...defaults, offset: 40, beforeTime: 9 }
    expect(getSearchQueryPagination(pagination)).toEqual({
      limit: 2,
      offset: 0,
    })
    expect(search(pagination).map((contract) => contract.id)).toEqual([
      'title-3',
      'title-4',
    ])
  })

  it('deduplicates a market that matches both its ticker and its title', () => {
    const page = getSearchResultPage([ticker, ticker, ...titles], {
      ...defaults,
      sort: 'score',
      limit: 10,
    })
    expect(page.map((contract) => contract.id)).toEqual([
      ...titles.map((contract) => contract.id),
      ticker.id,
    ])
  })

  it('respects ascending display order after selecting an offset page', () => {
    const page = getSearchResultPage([ticker, ...titles], {
      ...defaults,
      sort: 'close-date',
      offset: 1,
      order: 'asc',
    })
    expect(page.map((contract) => contract.id)).toEqual(['title-2', 'title-1'])
  })
})
