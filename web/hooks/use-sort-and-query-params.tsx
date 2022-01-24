import { useRouter } from 'next/router'

export type Sort =
  | 'creator'
  | 'tag'
  | 'newest'
  | 'most-traded'
  | '24-hour-vol'
  | 'close-date'
  | 'resolved'
  | 'all'

export function useQueryAndSortParams(options?: { defaultSort: Sort }) {
  const router = useRouter()

  const { s: sort, q: query } = router.query as {
    q?: string
    s?: Sort
  }

  const setSort = (sort: Sort | undefined) => {
    router.query.s = sort
    router.push(router, undefined, { shallow: true })
  }

  const setQuery = (query: string | undefined) => {
    if (query) {
      router.query.q = query
    } else {
      delete router.query.q
    }

    router.push(router, undefined, { shallow: true })
  }

  return {
    sort: sort ?? options?.defaultSort ?? 'creator',
    query: query ?? '',
    setSort,
    setQuery,
  }
}
