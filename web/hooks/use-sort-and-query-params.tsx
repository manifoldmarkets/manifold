import _ from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'

const MARKETS_SORT = 'markets_sort'

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

export function useQueryAndSortParams(options?: {
  defaultSort: Sort
  shouldLoadFromStorage?: boolean
}) {
  const { defaultSort, shouldLoadFromStorage } = _.defaults(options, {
    shouldLoadFromStorage: true,
  })
  const router = useRouter()

  const { s: sort, q: query } = router.query as {
    q?: string
    s?: Sort
  }

  const setSort = (sort: Sort | undefined) => {
    router.query.s = sort
    router.push(router, undefined, { shallow: true })
    if (shouldLoadFromStorage) {
      localStorage.setItem(MARKETS_SORT, sort || '')
    }
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

  useEffect(() => {
    // If there's no sort option, then set the one from localstorage
    if (!sort && shouldLoadFromStorage) {
      const localSort = localStorage.getItem(MARKETS_SORT) as Sort
      if (localSort) {
        setSort(localSort)
      }
    }
  })

  return {
    sort: sort ?? defaultSort ?? '24-hour-vol',
    query: queryState ?? '',
    setSort,
    setQuery,
  }
}
