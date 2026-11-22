import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getSportsIndex } from 'shared/supabase/sports-index'

// Topic pages redirect by these lists and cache the answer for hours, so it
// errors rather than return the curated sports alone: a topic page treats an
// error as unknown and asks again soon.
export const sportsIndex: APIHandler<'sports-index'> = async () => {
  const index = await getSportsIndex(createSupabaseDirectClient(), Date.now(), {
    curatedFallback: false,
  })
  const topics = isSportsBdlEnabled()
    ? index.topics.map((topic) => {
        const filingSport = index.sportByTopicId[topic.id]
        return topic.sport === 'all' && filingSport
          ? { ...topic, filingSport }
          : topic
      })
    : index.topics
  return { sports: index.sports, topics }
}
