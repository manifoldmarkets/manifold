import { run } from 'common/supabase/utils'
import { db } from 'common/src/supabase/db'

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
