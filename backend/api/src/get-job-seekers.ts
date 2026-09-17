import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import {
  JobInterest,
  JobRegion,
  JobSeekerAdminRow,
  JobSkill,
} from 'common/job-seeker'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

// Admin roster for /admin/jobs: everyone who registered job interest, with
// account stats and their overall all-time-profit rank.
export const getJobSeekers: APIHandler<'get-job-seekers'> = async (_, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()

  // overall_rank mirrors the profit_rank() function behind /leaderboards:
  // null profit falls back to balance + spice + investments - deposits, and
  // hidden accounts are excluded, so the rank shown here matches the one the
  // candidate sees. One window pass over the portfolio table, joined to the
  // roster.
  const rows = await pg.manyOrNone<{
    user_id: string
    username: string
    name: string
    is_bot: boolean
    joined_time: number
    last_bet_time: number | null
    profit: number | null
    portfolio: number | null
    overall_rank: number | null
    skills: JobSkill[] | null
    interests: JobInterest[] | null
    region: JobRegion | null
    registered_time: number
  }>(
    `with ranked as (
       select user_id, rank() over (order by coalesce(
           profit, balance + spice_balance + investment_value - total_deposits
         ) desc) as rank
       from user_portfolio_history_latest
       where not user_id = any($1)
     )
     select u.id as user_id, u.username, u.name, u.is_bot,
       ts_to_millis(u.created_time) as joined_time,
       nullif(u.data->>'lastBetTime', '')::bigint as last_bet_time,
       p.profit,
       p.balance + p.investment_value as portfolio,
       r.rank as overall_rank,
       j.skills, j.interests, j.region,
       ts_to_millis(j.created_time) as registered_time
     from job_seeker_interest j
     join users u on u.id = j.user_id
     left join user_portfolio_history_latest p on p.user_id = j.user_id
     left join ranked r on r.user_id = j.user_id
     where j.open_to_contact
       and coalesce((u.data->'userDeleted')::boolean, false) is not true
     order by p.profit desc nulls last`,
    [HIDE_FROM_LEADERBOARD_USER_IDS]
  )

  const seekers: JobSeekerAdminRow[] = rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    name: r.name,
    isBot: r.is_bot,
    joinedTime: Number(r.joined_time),
    lastBetTime: r.last_bet_time === null ? null : Number(r.last_bet_time),
    profit: r.profit === null ? null : Number(r.profit),
    portfolio: r.portfolio === null ? null : Number(r.portfolio),
    overallRank: r.overall_rank === null ? null : Number(r.overall_rank),
    skills: r.skills ?? [],
    interests: r.interests ?? [],
    region: r.region ?? null,
    registeredTime: Number(r.registered_time),
  }))

  return { seekers }
}
