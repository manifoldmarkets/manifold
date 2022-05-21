import _ from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { useSearchBox } from 'react-instantsearch-hooks-web'

const MARKETS_SORT = 'markets_sort'

export type Sort =
  | 'newest'
  | 'oldest'
  | 'most-traded'
  | '24-hour-vol'
  | 'close-date'
  | 'resolve-date'
  | 'last-updated'

export function useInitialQueryAndSort(options?: {
  defaultSort: Sort
  shouldLoadFromStorage?: boolean
}) {
  const { defaultSort, shouldLoadFromStorage } = _.defaults(options, {
    defaultSort: '24-hour-vol',
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
        const localSort = localStorage.getItem(MARKETS_SORT) as Sort
        if (localSort) {
          router.query.s = localSort
          // Use replace to not break navigating back.
          router.replace(router, undefined, { shallow: true })
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

export function useUpdateQueryAndSort(props: {
  shouldLoadFromStorage: boolean
}) {
  const { shouldLoadFromStorage } = props
  const router = useRouter()

  const setSort = (sort: Sort | undefined) => {
    if (sort !== router.query.s) {
      router.query.s = sort
      router.push(router, undefined, { shallow: true })
      if (shouldLoadFromStorage) {
        localStorage.setItem(MARKETS_SORT, sort || '')
      }
    }
  }

  const { query, refine } = useSearchBox()

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
    refine(query ?? '')
    pushQuery(query)
  }

  return {
    setSort,
    setQuery,
    query,
  }
}
