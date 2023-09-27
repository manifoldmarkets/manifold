import { debounce, uniqBy } from 'lodash'
import { useEffect, useMemo } from 'react'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { auth } from 'web/lib/firebase/users'

export function useTrendingTopicsSearchResults(
  query: string,
  limit: number,
  lockSearch: boolean,
  persistKey?: string
) {
  const [results, setResults] = usePersistentInMemoryState<SearchGroupInfo[]>(
    [],
    persistKey ?? 'trending-groups-market-search'
  )

  const search = async (query: string) => {
    searchGroups({ term: query, limit }).then((results) =>
      setResults(uniqBy(results.data, 'id'))
    )
  }
  const debouncedOnSearch = useMemo(() => debounce(search, 50), [limit])

  useEffect(() => {
    if (lockSearch) return
    if (query) debouncedOnSearch(query)
    else search('') // don't debounce on page load
  }, [
    query,
    debouncedOnSearch,
    lockSearch,
    // need to pass FB user to get auth token to request customized groups
    auth.currentUser?.uid,
  ])

  return results
}
