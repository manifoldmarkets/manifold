import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

export type ActiveUserManaStats = {
  date: string
  activeBalance: number
}

export const getActiveUserManaStats: APIHandler<
  'get-active-user-mana-stats'
> = async (props) => {
  const { limitDays } = props
  const pg = createSupabaseDirectClient()

  // For each day in the range, calculate the sum of current balances for users
  // who were active (made an interaction) in the 30 days before that day.
  //
  // Note: This uses CURRENT user balances, not historical balances.
  //
  // Performance: This query is O(days * active_user_days) due to the range join,
  // but is acceptable because:
  // 1. It's cached via getStaticProps (revalidates every hour)
  // 2. The LIGHT_CACHE_STRATEGY caches the API response
  // 3. The index on user_contract_interactions(user_id, created_time) helps
  const results = await pg.manyOrNone<ActiveUserManaStats>(
    `
    with date_series as (
      select generate_series(
        current_date - interval '1 day' * $1,
        current_date,
        interval '1 day'
      )::date as dt
    ),
    -- Get all user interactions with their dates, deduped per day
    user_activity_days as (
      select 
        user_id,
        created_time::date as activity_date
      from user_contract_interactions
      where created_time >= current_date - interval '1 day' * ($1 + 30)
      group by user_id, created_time::date
    ),
    -- For each date, find users who were active in the 30 days prior
    daily_active_users as (
      select 
        ds.dt,
        uad.user_id
      from date_series ds
      join user_activity_days uad 
        on uad.activity_date >= ds.dt - interval '30 days'
        and uad.activity_date < ds.dt
      group by ds.dt, uad.user_id
    ),
    daily_stats as (
      select
        dau.dt as date,
        sum(u.balance) as active_balance
      from daily_active_users dau
      join users u on u.id = dau.user_id
      group by dau.dt
    )
    select 
      date::text,
      coalesce(active_balance, 0) as "activeBalance"
    from daily_stats
    order by date
    `,
    [limitDays]
  )

  return results ?? []
}
