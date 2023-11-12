import { GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW } from 'common/envs/constants'
import { Group } from 'common/group'
import { ALL_TOPICS, TOPICS_TO_SUBTOPICS, removeEmojis } from 'common/topics'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'

export async function getTrendingGroups<G extends Group>({
  limit = 20,
}: { limit?: number } = {}) {
  const hardCodedTopicIds = Object.keys(TOPICS_TO_SUBTOPICS)

  const { data } = await db
    .from('groups')
    .select('id,data')
    .not('id', 'in', `(${hardCodedTopicIds.join(',')})`)
    .not('slug', 'in', `(${GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW.join(',')})`)
    .not('name', 'in', `(${ALL_TOPICS.map((t) => removeEmojis(t)).join(',')})`)
    .filter('slug', 'not.ilike', '%manifold%')
    .filter('slug', 'not.ilike', '%sccsq%')
    .order('importance_score', { ascending: false })
    .limit(limit)

  const groups = (data ?? [])?.map(({ data }) => data as G)

  return groups
}

export function useGetTrendingGroups<G extends Group>(
  options: { limit?: number } = {}
) {
  const [trendingGroups, setTrendingGroups] = useState<Array<G>>([])

  useEffect(() => {
    getTrendingGroups<G>(options).then(setTrendingGroups)
  }, [options.limit])

  return trendingGroups
}
