import { SupabaseDirectClient } from 'shared/supabase/init'
import { DAY_MS } from 'common/util/time'
import { ENV_CONFIG } from 'common/envs/constants'
import { VIEW_RECORDINGS_START } from 'common/feed'

export const getFeedConversionScores = async (
  pg: SupabaseDirectClient,
  startTime: number,
  numberOfDays: number
) => {
  const { adminIds } = ENV_CONFIG
  const conversionsByDay: number[] = []
  for (let i = 0; i < numberOfDays; i++) {
    const start = startTime + i * DAY_MS
    const end = start + DAY_MS
    if (start < VIEW_RECORDINGS_START) continue
    const interactionCounts = await pg.one(
      `
          select count(uci.name) as count
          from user_contract_interactions uci
          where uci.created_time > millis_to_ts($1)
            and uci.created_time < millis_to_ts($2)
            and uci.name in ('card click', 'card bet', 'card like')
            and uci.user_id not in ($3:list)
          `,
      [start, end, adminIds],
      (row) => Number(row.count)
    )
    const viewCounts = await pg.one(
      `
      select count(*) as count from postgres.public.user_view_events uve
         where uve.created_time > millis_to_ts($1)
         and uve.created_time < millis_to_ts($2)
         and uve.name ='card'
         and uve.user_id not in ($3:list)
        `,
      [start, end, adminIds],
      (row) => Number(row.count)
    )
    const conversionScore = interactionCounts / viewCounts
    conversionsByDay.push(conversionScore)
  }
  return conversionsByDay
}
