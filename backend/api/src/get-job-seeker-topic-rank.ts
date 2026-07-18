import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import { JobSeekerTopicRank } from 'common/job-seeker'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'

// Site-wide profit leaderboard for one topic, filtered to job-board
// registrants: "Jack1 is #3 of 12,481 traders in us-politics". Mirrors the
// public topic leaderboard's filters (get-leaderboard.ts) — unranked
// contracts, banned users, and hidden accounts excluded — so this rank
// matches the one the candidate can see. Aggregates all user_contract_metrics
// for the topic's contracts, so big topics take a few seconds — called on
// demand from /admin/jobs, never in a loop.
export const getJobSeekerTopicRank: APIHandler<
  'get-job-seeker-topic-rank'
> = async ({ topic }, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()

  const group = await pg.oneOrNone(
    `select id from groups where slug = $1 limit 1`,
    [topic]
  )
  if (!group) throw new APIError(404, `No topic with slug ${topic}`)

  // participants comes from the full ranking pool, independent of the
  // job-seeker join, so it stays correct when no registrant ranks in the
  // topic.
  const result = await pg.one<{
    participants: number
    ranks: JobSeekerTopicRank[]
  }>(
    `with topic_profits as (
       select m.user_id, sum(m.profit) as profit
       from user_contract_metrics m
       join contracts c on c.id = m.contract_id
       join users u on u.id = m.user_id
       where m.answer_id is null
         and c.id in (
           select contract_id from group_contracts where group_id = $1)
         and coalesce((c.data->'isRanked')::boolean, true) = true
         and coalesce((u.data->>'isBannedFromPosting')::boolean, false)
           is not true
         and c.token = 'MANA'
         and not m.user_id = any($2)
       group by m.user_id
     ), ranked as (
       select user_id, rank() over (order by profit desc) as rank
       from topic_profits
     )
     select
       (select count(*) from topic_profits) as participants,
       coalesce(
         (select json_agg(
            json_build_object('userId', r.user_id, 'rank', r.rank)
            order by r.rank)
          from ranked r
          join job_seeker_interest j
            on j.user_id = r.user_id and j.open_to_contact),
         '[]'::json
       ) as ranks`,
    [group.id, HIDE_FROM_LEADERBOARD_USER_IDS]
  )

  return {
    participants: Number(result.participants),
    ranks: result.ranks,
  }
}
