import { useEffect, useState } from 'react'
import { SearchGroupInfo } from 'web/lib/supabase/groups'
import { getGroupFromSlug } from 'web/lib/supabase/group'

export const useGroupFromRouter = (
  category: string,
  groups: SearchGroupInfo[]
) => {
  const [categoryFromRouter, setCategoryFromRouter] =
    useState<SearchGroupInfo>()
  useEffect(() => {
    if (category) {
      if (!groups.some((g) => g.slug === category)) {
        getGroupFromSlug(category).then((g) =>
          setCategoryFromRouter(g ?? undefined)
        )
      }
    } else {
      setCategoryFromRouter(undefined)
    }
  }, [category])
  return categoryFromRouter
}
