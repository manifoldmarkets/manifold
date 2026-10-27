import { mapValues } from 'lodash'

import { Row, run } from 'common/supabase/utils'
import { db } from './db'

// The daily_stats columns /stats reads. The page embeds its rows in its HTML,
// so it skips the rest: topic_daus alone was about 950 KB of a 2.5 MB page,
// and is loaded by getTopicDayStats only when the Topics section opens. Rows
// are typed to these columns, so reading any other is a type error.
export const STATS_PAGE_COLUMNS = [
  'start_date',
  'dav',
  'dau',
  'wau',
  'mau',
  'signups_real',
  'd1',
  'w1',
  'm1',
  'nd1',
  'nw1',
  'active_d1_to_d3',
  'bet_count',
  'contract_count',
  'comment_count',
  'bet_amount',
  'activation',
  'd1_bet_average',
  'd1_bet_3_day_average',
  'feed_conversion',
  'sales',
] as const
export type StatsPageRow = Pick<
  Row<'daily_stats'>,
  (typeof STATS_PAGE_COLUMNS)[number]
>

export const getStatsPageRows = async (startDate = '2024-01-01') => {
  const { data } = await run(
    db
      .from('daily_stats')
      .select(STATS_PAGE_COLUMNS.join(','))
      .order('start_date')
      .gte('start_date', startDate)
  )
  return (data as unknown as StatsPageRow[]).map(roundStatsRow)
}

// Rates and averages come back with 16 significant digits. Four decimal places
// is finer than any chart or tile shows, and saves a quarter of the rows' size.
const roundStatsRow = (row: StatsPageRow) =>
  mapValues(row, (v) =>
    typeof v === 'number' && !Number.isInteger(v)
      ? Math.round(v * 1e4) / 1e4
      : v
  ) as StatsPageRow

export type TopicDayRow = Pick<
  Row<'daily_stats'>,
  'start_date' | 'dau' | 'topic_daus'
>

export const getTopicDayStats = async (startDate = '2024-01-01') => {
  const { data } = await run(
    db
      .from('daily_stats')
      .select('start_date, dau, topic_daus')
      .order('start_date')
      .gte('start_date', startDate)
  )
  return data as TopicDayRow[]
}

// export type Stats = { [key in keyof Row<'daily_stats'>]: Row<'daily_stats'>[key][] }

export const getStats = async (startDate?: string) => {
  const { data } = await run(
    db
      .from('daily_stats')
      .select()
      .order('start_date')
      .gte('start_date', startDate ?? '2024-01-01')
  )
  return data

  // if (data.length === 0) {
  //   return {} as Stats
  // }

  // const keys = Object.keys(data[0]) as (keyof Row<'daily_stats'>)[]

  // return Object.fromEntries(
  //   keys.map((key) => [key, data.map((d) => d[key])])
  // ) as Stats
}
