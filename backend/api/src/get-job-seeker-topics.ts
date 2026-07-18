import { JobSeekerTopicProfit } from 'common/job-seeker'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

// A registrant's most profitable topics, from their contract metrics. Loaded
// on demand per row on /admin/jobs — bot accounts can have 100k+ positions,
// so this is too heavy to compute for the whole roster on page load.
export const getJobSeekerTopics: APIHandler<'get-job-seeker-topics'> = async (
  { userId },
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone(
    `select g as topic, round(sum(m.profit)) as profit
     from user_contract_metrics m
     join contracts c on c.id = m.contract_id
     cross join lateral unnest(c.group_slugs) as g
     where m.user_id = $1 and m.answer_id is null
     group by 1
     having sum(m.profit) > 1000
     order by 2 desc
     limit 15`,
    [userId]
  )

  const topics: JobSeekerTopicProfit[] = rows.map((r) => ({
    topic: r.topic,
    profit: Number(r.profit),
  }))
  return { topics }
}
