import _ from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'

export type Sort =
  | 'creator'
  | 'tag'
  | 'newest'
  | 'oldest'
  | 'most-traded'
  | '24-hour-vol'
  | 'close-date'
  | 'closed'
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

  const [queryState, setQueryState] = useState(query)

  useEffect(() => {
    setQueryState(query)
  }, [query])

  // Debounce router query update.
  const pushQuery = useMemo(
    () =>
      _.debounce((query: string | undefined) => {
        if (query) {
          router.query.q = query
        } else {
          delete router.query.q
        }
        router.push(router, undefined, { shallow: true })
      }, 500),
    [router]
  )

  const setQuery = (query: string | undefined) => {
    setQueryState(query)
    pushQuery(query)
  }

  return {
    sort: sort ?? options?.defaultSort ?? '24-hour-vol',
    query: queryState ?? '',
    setSort,
    setQuery,
  }
}
