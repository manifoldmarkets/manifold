import { debounce } from 'lodash'
import { useEffect, useMemo } from 'react'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export function useTrendingGroupsSearchResults(query: string, limit: number) {
  const [results, setResults] = usePersistentInMemoryState<SearchGroupInfo[]>(
    [],
    'trending-groups-market-search'
  )

  const debouncedOnSearch = useMemo(
    () =>
      debounce(async (query: string) => {
        searchGroups({ term: query, limit }).then((results) =>
          setResults(results.data)
        )
      }, 50),
    [limit]
  )

  useEffect(() => {
    debouncedOnSearch(query)
  }, [query, debouncedOnSearch])

  return results
}
