import { useEffect } from 'react'
import { SearchGroupInfo } from 'web/lib/supabase/groups'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export const useGroupFromRouter = (topicSlug: string) => {
  const [categoryFromRouter, setCategoryFromRouter] =
    usePersistentInMemoryState<SearchGroupInfo | undefined>(
      undefined,
      'categoryFromRouter'
    )
  useEffect(() => {
    if (topicSlug)
      getGroupFromSlug(topicSlug).then((g) =>
        setCategoryFromRouter(g ?? undefined)
      )
  }, [topicSlug])
  return categoryFromRouter
}
