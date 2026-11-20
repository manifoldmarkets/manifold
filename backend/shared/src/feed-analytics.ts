import { SupabaseDirectClient } from 'shared/supabase/init'
import { ENV_CONFIG } from 'common/envs/constants'
import { VIEW_RECORDINGS_START } from 'common/feed'
import * as dayjs from 'dayjs'

export const getFeedConversionScores = async (
  pg: SupabaseDirectClient,
  start: string, // YYYY-MM-DD
  end: string
) => {
  const { adminIds } = ENV_CONFIG

  const minDate = dayjs(VIEW_RECORDINGS_START)
    .tz('America/Los_Angeles')
    .endOf('day')
    .format('YYYY-MM-DD')

  const realStart = start < minDate ? minDate : start

  return await pg.manyOrNone<{
    start_date: string
    feed_conversion: number
  }>(
    // Each user's click, bet or like on a market counts once a day. Views are
    // already deduped at write time (one per user and market per minute), but
    // interactions were not: on 2026-10-24 one double-firing card logged 8
    // clicks in about a second, a third of that day's numerator.
    `with interacts as (
      select start_date, count(*) as count
      from (
        select distinct
          date_trunc('day', created_time at time zone 'america/los_angeles')::date as start_date,
          user_id,
          contract_id,
          name
        from user_contract_interactions
        where
          name in ('card click', 'card bet', 'card like')
          and created_time >= date_to_midnight_pt($1)
          and created_time < date_to_midnight_pt($2)
          and user_id not in ($3:list)
      ) daily_interactions
      group by start_date
    ),
    views as (
      select
        date_trunc('day', created_time at time zone 'america/los_angeles')::date as start_date,
        count(*)
      from user_view_events
      where
        name = 'card'
        and created_time >= date_to_midnight_pt($1)
        and created_time < date_to_midnight_pt($2)
        and user_id not in ($3:list)
      group by start_date
    )
    select
      i.start_date, i.count / v.count::numeric as feed_conversion
      from interacts i join views v
    on i.start_date = v.start_date`,
    [realStart, end, adminIds]
  )
}
