import { debounce } from 'lodash'
import { useEffect, useMemo, useState } from 'react'
import { SearchGroupInfo, searchGroups } from 'web/lib/supabase/groups'

export function useGroupSearchResults(query: string, limit: number) {
  const [results, setResults] = useState<SearchGroupInfo[]>([])

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
