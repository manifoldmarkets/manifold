import { searchInAny } from 'common/util/parse'
import { SORTS } from '../supabase-search'

export const searchQuestionSorts = (query: string) => {
  if (query.length < 2) {
    return []
  }

  return SORTS.filter(
    (sort) => sort.value !== 'relevance' && searchInAny(query, sort.label)
  ).map((sort) => sort.value)
}
