import { Contract } from 'common/contract'
import {
  SearchSort,
  getSearchQueryPagination,
  getSearchResultPage,
  sortLikeSql,
} from './search-pagination'

const market = (
  id: string,
  createdTime: number,
  importanceScore = 0,
  uniqueBettorCount = 0
) =>
  ({
    id,
    createdTime,
    importanceScore,
    uniqueBettorCount,
  } as unknown as Contract)

// The `score` sort as the database and getSearchSort both define it.
const score: SearchSort = {
  keys: (c) => [c.importanceScore, c.uniqueBettorCount],
  directions: [
    { order: 'desc', nullsFirst: true },
    { order: 'desc', nullsFirst: true },
  ],
}
const newest: SearchSort = {
  keys: (c) => [c.createdTime],
  directions: [{ order: 'desc', nullsFirst: true }],
}

type Pagination = {
  limit: number
  offset: number
  beforeTime?: number
  sort: string
  ordering: SearchSort
}

// Simulates the per-tier SQL lookups: each tier is filtered by the cursor,
// ordered exactly as the database orders it (the same total order, id
// tiebreak included) and cut at the query's limit/offset, before the API
// merges the tiers in relevance order and cuts the page.
const search = (tiers: Contract[][], pagination: Pagination) => {
  const query = getSearchQueryPagination(pagination)
  const candidates = tiers.flatMap((tier) =>
    sortLikeSql(
      tier.filter(
        (c) =>
          pagination.beforeTime === undefined ||
          c.createdTime < pagination.beforeTime
      ),
      pagination.ordering,
      (c) => c
    ).slice(query.offset, query.offset + query.limit)
  )
  return getSearchResultPage(candidates, pagination)
}

const ids = (contracts: Contract[]) => contracts.map((c) => c.id)

// Every offset page in turn, as an infinite-scrolling client requests them.
const walkOffsetPages = (tiers: Contract[][], pagination: Pagination) => {
  const pages: string[][] = []
  for (let offset = 0; ; offset += pagination.limit) {
    const page = ids(search(tiers, { ...pagination, offset }))
    if (page.length === 0) return pages
    pages.push(page)
  }
}

describe('sortLikeSql', () => {
  it('ranks by each key in turn, in its own direction, then by id', () => {
    const rows = [
      market('c', 1, 0, 50),
      market('b', 1, 0.5, 1),
      market('a', 1, 0.5, 1),
      market('d', 1, 0.9, 0),
      market('e', 1, 0, 40),
    ]
    expect(ids(sortLikeSql(rows, score, (c) => c))).toEqual([
      'd',
      'a',
      'b',
      'c',
      'e',
    ])
  })

  it('places nulls where Postgres does for the direction', () => {
    const rows = [market('a', 1, 0.2), market('b', 1, NaN), market('c', 1, 0.7)]
    const nullsFirst: SearchSort = {
      keys: (c) => [c.importanceScore],
      directions: [{ order: 'desc', nullsFirst: true }],
    }
    const nullsLast: SearchSort = {
      keys: (c) => [c.importanceScore],
      directions: [{ order: 'desc', nullsFirst: false }],
    }
    expect(ids(sortLikeSql(rows, nullsFirst, (c) => c))).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(ids(sortLikeSql(rows, nullsLast, (c) => c))).toEqual(['c', 'a', 'b'])
  })

  it('scales numeric keys by the weight, so an answer match counts half', () => {
    const matches = [
      { data: market('answer', 1, 0.8), type: 'answer' },
      { data: market('title', 1, 0.5), type: 'title' },
      { data: market('weak', 1, 0.3), type: 'title' },
    ]
    const sorted = sortLikeSql(
      matches,
      score,
      (m) => m.data,
      (m) => (m.type === 'answer' ? 0.5 : 1)
    )
    expect(sorted.map((m) => m.data.id)).toEqual(['title', 'answer', 'weak'])
  })
})

describe('search pagination across ticker and title matches', () => {
  const ticker = market('ticker-only', 1)
  const titles = Array.from({ length: 5 }, (_, i) =>
    market(`title-${i + 1}`, 10 - i)
  )
  const defaults: Pagination = {
    limit: 2,
    offset: 0,
    sort: 'newest',
    ordering: newest,
  }

  it('does not let an old ticker advance the newest-first cursor', () => {
    const tiers = [[ticker], titles, titles]
    const first = search(tiers, defaults)
    expect(ids(first)).toEqual(['title-1', 'title-2'])

    const second = search(tiers, {
      ...defaults,
      beforeTime: first[1].createdTime,
    })
    expect(ids(second)).toEqual(['title-3', 'title-4'])

    const third = search(tiers, {
      ...defaults,
      beforeTime: second[1].createdTime,
    })
    expect(ids(third)).toEqual(['title-5', 'ticker-only'])
  })

  it('returns every match exactly once across offset pages', () => {
    const pages = walkOffsetPages([[ticker], titles, titles], defaults)
    expect(pages.flat()).toEqual([...ids(titles), ticker.id])
  })

  it('preserves relevance priority without losing displaced title matches', () => {
    const pagination = { ...defaults, sort: 'score', ordering: score }
    const pages = walkOffsetPages([[ticker], titles, titles], pagination)
    expect(pages[0]).toEqual(['ticker-only', 'title-1'])
    expect(pages.flat()).toEqual(['ticker-only', ...ids(titles)])
  })

  it('ignores the offset when a time cursor is supplied', () => {
    const pagination = { ...defaults, offset: 40, beforeTime: 9 }
    expect(getSearchQueryPagination(pagination)).toEqual({
      limit: 2,
      offset: 0,
    })
    expect(ids(search([[ticker], titles, titles], pagination))).toEqual([
      'title-3',
      'title-4',
    ])
  })

  it('deduplicates a market that matches both its ticker and its title', () => {
    const page = getSearchResultPage([ticker, ticker, ...titles], {
      ...defaults,
      sort: 'score',
      ordering: score,
      limit: 10,
    })
    // Every key ties, so ids decide the order — on both sides.
    expect(ids(page)).toEqual([ticker.id, ...ids(titles)])
  })

  it('respects ascending display order after selecting an offset page', () => {
    const ascending: SearchSort = {
      keys: (c) => [c.createdTime],
      directions: [{ order: 'asc', nullsFirst: false }],
    }
    const page = getSearchResultPage([ticker, ...titles], {
      ...defaults,
      sort: 'close-date',
      ordering: ascending,
      offset: 1,
    })
    expect(ids(page)).toEqual(['title-2', 'title-1'])
  })
})

describe('search pagination when SQL and JS must agree on the order', () => {
  // The score sort's database order: importance first, then bettor count.
  // A popular zero-importance market therefore sorts BELOW every scored one,
  // and the merge must not rank it any other way.
  const scored = [
    market('hot', 1, 0.9, 1),
    market('warm', 1, 0.5, 1),
    market('mild', 1, 0.2, 3),
  ]
  const popularButUnscored = [
    market('crowd', 1, 0, 50),
    market('busy', 1, 0, 40),
  ]
  const all = [...scored, ...popularButUnscored]
  const pagination: Pagination = {
    limit: 2,
    offset: 0,
    sort: 'score',
    ordering: score,
  }

  it('pages plain title matches without repeating or skipping any', () => {
    const pages = walkOffsetPages([all], pagination)
    expect(pages).toEqual([['hot', 'warm'], ['mild', 'crowd'], ['busy']])
  })

  it('keeps the same guarantee when the tiers overlap', () => {
    const pages = walkOffsetPages([all, scored, popularButUnscored], pagination)
    expect(pages.flat()).toEqual(['hot', 'warm', 'mild', 'crowd', 'busy'])
  })

  it('breaks exact ties by id on both sides, so ties cannot reorder', () => {
    const ties = ['d', 'b', 'a', 'c', 'e'].map((id) => market(id, 1, 0, 0))
    const pages = walkOffsetPages([ties, [...ties].reverse()], pagination)
    expect(pages).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })
})
