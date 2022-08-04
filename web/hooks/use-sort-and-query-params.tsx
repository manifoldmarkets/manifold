import { defaults, debounce } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_SORT } from 'web/components/contract-search'

const MARKETS_SORT = 'markets_sort'

export type Sort =
  | 'newest'
  | 'oldest'
  | 'most-traded'
  | '24-hour-vol'
  | 'close-date'
  | 'resolve-date'
  | 'last-updated'
  | 'score'

export function getSavedSort() {
  // TODO: this obviously doesn't work with SSR, common sense would suggest
  // that we should save things like this in cookies so the server has them
  if (typeof window !== 'undefined') {
    return localStorage.getItem(MARKETS_SORT) as Sort | null
  } else {
    return null
  }
}

export function useInitialQueryAndSort(options?: {
  defaultSort: Sort
  shouldLoadFromStorage?: boolean
}) {
  const { defaultSort, shouldLoadFromStorage } = defaults(options, {
    defaultSort: DEFAULT_SORT,
    shouldLoadFromStorage: true,
  })
  const router = useRouter()

  const [initialSort, setInitialSort] = useState<Sort | undefined>(undefined)
  const [initialQuery, setInitialQuery] = useState('')

  useEffect(() => {
    // If there's no sort option, then set the one from localstorage
    if (router.isReady) {
      const { s: sort, q: query } = router.query as {
        q?: string
        s?: Sort
      }

      setInitialQuery(query ?? '')

      if (!sort && shouldLoadFromStorage) {
        console.log('ready loading from storage ', sort ?? defaultSort)
        const localSort = getSavedSort()
        if (localSort) {
          // Use replace to not break navigating back.
          router.replace(
            { query: { ...router.query, s: localSort } },
            undefined,
            { shallow: true }
          )
        }
        setInitialSort(localSort ?? defaultSort)
      } else {
        setInitialSort(sort ?? defaultSort)
      }
    }
  }, [defaultSort, router.isReady, shouldLoadFromStorage])

  return {
    initialSort,
    initialQuery,
  }
}

export function useQueryAndSortParams(options?: {
  defaultSort?: Sort
  shouldLoadFromStorage?: boolean
}) {
  const { defaultSort = DEFAULT_SORT, shouldLoadFromStorage = true } =
    options ?? {}
  const router = useRouter()

  const { s: sort, q: query } = router.query as {
    q?: string
    s?: Sort
  }

  const setSort = (sort: Sort | undefined) => {
    router.replace({ query: { ...router.query, s: sort } }, undefined, {
      shallow: true,
    })
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
      debounce((query: string | undefined) => {
        const queryObj = { ...router.query, q: query }
        if (!query) delete queryObj.q
        router.replace({ query: queryObj }, undefined, {
          shallow: true,
        })
      }, 100),
    [router]
  )

  const setQuery = (query: string | undefined) => {
    setQueryState(query)
    pushQuery(query)
  }

  useEffect(() => {
    // If there's no sort option, then set the one from localstorage
    if (router.isReady && !sort && shouldLoadFromStorage) {
      const localSort = localStorage.getItem(MARKETS_SORT) as Sort
      if (localSort && localSort !== defaultSort) {
        // Use replace to not break navigating back.
        router.replace(
          { query: { ...router.query, s: localSort } },
          undefined,
          { shallow: true }
        )
      }
    }
  })

  return {
    sort: sort ?? defaultSort,
    query: queryState ?? '',
    setSort,
    setQuery,
  }
}
