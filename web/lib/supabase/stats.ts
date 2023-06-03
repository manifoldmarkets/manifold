import { run } from 'common/supabase/utils'
import { db } from './db'
import { Stats } from 'common/stats'

export const getStats = async () => {
  const { data } = await run(db.from('stats').select('*'))
  return Object.fromEntries(
    data.map(({ title, daily_values }) => [title, daily_values])
  ) as Stats
}
