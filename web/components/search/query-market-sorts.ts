import { searchInAny } from 'common/util/parse'
import { SORTS } from 'web/components/supabase-search'

export const searchMarketSorts = (query: string) => {
  if (query.length < 2) {
    return []
  }

  return SORTS.filter((sort) => searchInAny(query, sort.label)).map(
    (sort) => sort.value
  )
}
