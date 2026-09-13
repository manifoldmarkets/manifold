import { JobSeekerTopicProfit } from 'common/job-seeker'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'

// A registrant's most profitable topics, from their contract metrics. Loaded
// on demand per row on /admin/jobs — bot accounts can have 100k+ positions,
// so this is too heavy to compute for the whole roster on page load.
export const getJobSeekerTopics: APIHandler<'get-job-seeker-topics'> = async (
  { userId },
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()

  // Same opt-in scoping as the other job-seeker endpoints.
  const seeker = await pg.oneOrNone(
    `select 1 from job_seeker_interest
     where user_id = $1 and open_to_contact
     limit 1`,
    [userId]
  )
  if (!seeker) {
    throw new APIError(404, 'User is not an open-to-contact job seeker')
  }

  // distinct guards against duplicate slugs in the denormalized group_slugs
  // array double-counting a contract's profit; unranked contracts are
  // excluded to match the topic-rank endpoint and the public leaderboard.
  const rows = await pg.manyOrNone<{ topic: string; profit: number }>(
    `select g.slug as topic, round(sum(m.profit)) as profit
     from user_contract_metrics m
     join contracts c on c.id = m.contract_id
     cross join lateral (
       select distinct slug from unnest(c.group_slugs) as slug
     ) g
     where m.user_id = $1 and m.answer_id is null
       and coalesce((c.data->'isRanked')::boolean, true) = true
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
