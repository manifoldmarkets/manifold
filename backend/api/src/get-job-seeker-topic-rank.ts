import { JobSeekerTopicRank } from 'common/job-seeker'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'

// Site-wide profit leaderboard for one topic, filtered to job-board
// registrants: "Jack1 is #3 of 12,481 traders in us-politics". Aggregates all
// user_contract_metrics for the topic's contracts, so big topics take a few
// seconds — called on demand from /admin/jobs, never in a loop.
export const getJobSeekerTopicRank: APIHandler<
  'get-job-seeker-topic-rank'
> = async ({ topic }, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()

  const group = await pg.oneOrNone(`select id from groups where slug = $1`, [
    topic,
  ])
  if (!group) throw new APIError(404, `No topic with slug ${topic}`)

  const rows = await pg.manyOrNone(
    `with topic_profits as (
       select m.user_id, sum(m.profit) as profit
       from user_contract_metrics m
       where m.answer_id is null
         and m.contract_id in (
           select contract_id from group_contracts where group_id = $1)
       group by m.user_id
     ), ranked as (
       select user_id, profit, rank() over (order by profit desc) as rank
       from topic_profits
     )
     select r.user_id, u.username, r.rank, round(r.profit) as profit,
       (select count(*) from topic_profits) as participants
     from ranked r
     join job_seeker_interest j on j.user_id = r.user_id and j.open_to_contact
     join users u on u.id = r.user_id
     order by r.rank`,
    [group.id]
  )

  const ranks: JobSeekerTopicRank[] = rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    rank: Number(r.rank),
    profit: Number(r.profit),
  }))
  return {
    participants: rows.length > 0 ? Number(rows[0].participants) : 0,
    ranks,
  }
}
