import { JobSeekerAdminRow } from 'common/job-seeker'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

// Admin roster for /admin/jobs: everyone who registered job interest, with
// account stats and their overall all-time-profit rank.
export const getJobSeekers: APIHandler<'get-job-seekers'> = async (
  _,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone(
    `select u.id as user_id, u.username, u.name, u.is_bot,
       extract(epoch from u.created_time) * 1000 as joined_time,
       nullif(u.data->>'lastBetTime', '')::bigint as last_bet_time,
       p.profit,
       p.balance + p.investment_value as portfolio,
       j.skills, j.interests, j.region,
       extract(epoch from j.created_time) * 1000 as registered_time
     from job_seeker_interest j
     join users u on u.id = j.user_id
     left join user_portfolio_history_latest p on p.user_id = j.user_id
     where j.open_to_contact
     order by p.profit desc nulls last`
  )

  // One scan of the portfolio table computes every registrant's rank at once
  // (there is no index on profit, so per-user subqueries would rescan it).
  const ranks = await pg.manyOrNone<{ user_id: string; rank: string }>(
    `with regs as (
       select p.user_id, p.profit
       from user_portfolio_history_latest p
       join job_seeker_interest j on j.user_id = p.user_id and j.open_to_contact
     )
     select regs.user_id, count(*) filter (where p.profit > regs.profit) + 1 as rank
     from user_portfolio_history_latest p
     cross join regs
     group by regs.user_id, regs.profit`
  )
  const rankByUser = Object.fromEntries(
    ranks.map((r) => [r.user_id, Number(r.rank)])
  )

  const seekers: JobSeekerAdminRow[] = rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    name: r.name,
    isBot: r.is_bot,
    joinedTime: Number(r.joined_time),
    lastBetTime: r.last_bet_time ? Number(r.last_bet_time) : null,
    profit: r.profit === null ? null : Number(r.profit),
    portfolio: r.portfolio === null ? null : Number(r.portfolio),
    overallRank: rankByUser[r.user_id] ?? null,
    skills: r.skills ?? [],
    interests: r.interests ?? [],
    region: r.region ?? null,
    registeredTime: Number(r.registered_time),
  }))

  return { seekers }
}
