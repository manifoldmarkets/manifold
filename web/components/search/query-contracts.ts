import { Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import { searchClient, searchIndexName } from 'web/lib/service/algolia'

const index = searchClient.initIndex(searchIndexName)

export function useMarketSearchResults(query: string, limit: number) {
  const [results, setResults] = useState([] as Contract[])
  useEffect(() => {
    index
      .search(query, { hitsPerPage: limit })
      .then((data) => setResults(data.hits as any))
  }, [query, limit])
  return results
}
