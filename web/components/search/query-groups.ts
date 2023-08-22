import { debounce, uniqBy } from 'lodash'
import { useEffect, useMemo } from 'react'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export function useTrendingGroupsSearchResults(
  query: string,
  limit: number,
  lockSearch: boolean
) {
  const [results, setResults] = usePersistentInMemoryState<SearchGroupInfo[]>(
    [],
    'trending-groups-market-search'
  )

  const debouncedOnSearch = useMemo(
    () =>
      debounce(async (query: string) => {
        searchGroups({ term: query, limit }).then((results) =>
          setResults(uniqBy(results.data, 'id'))
        )
      }, 50),
    [limit]
  )

  useEffect(() => {
    if (lockSearch) return
    debouncedOnSearch(query)
  }, [query, debouncedOnSearch, lockSearch])

  return results
}
