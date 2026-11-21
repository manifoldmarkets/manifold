import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  parsePollingRows,
  ScorePollingSettings,
} from 'common/sports-score-polling'

// How often the resolver asks for scores (common/sports-score-polling.ts),
// set on /admin/sports. A missing row means the default.

export interface ScorePollingRow {
  target: string
  intervalSeconds: number
  updatedBy: string
  updatedTime: number
}

export function getScorePollingRows(
  pg: SupabaseDirectClient
): Promise<ScorePollingRow[]> {
  return pg.map(
    `select target, interval_seconds, updated_by, updated_time
       from sports_score_polling`,
    [],
    (r) => ({
      target: r.target,
      intervalSeconds: r.interval_seconds,
      updatedBy: r.updated_by,
      updatedTime: new Date(r.updated_time).getTime(),
    })
  )
}

export async function getScorePollingSettings(
  pg: SupabaseDirectClient
): Promise<ScorePollingSettings> {
  return parsePollingRows(await getScorePollingRows(pg))
}

/** Sets a target's interval, or with null goes back to the default. */
export async function setScorePolling(
  pg: SupabaseDirectClient,
  props: { target: string; intervalSeconds: number | null; userId: string }
) {
  const { target, intervalSeconds, userId } = props
  if (intervalSeconds === null) {
    await pg.none(`delete from sports_score_polling where target = $1`, [
      target,
    ])
    return
  }
  await pg.none(
    `insert into sports_score_polling (target, interval_seconds, updated_by)
     values ($1, $2, $3)
     on conflict (target) do update
       set interval_seconds = excluded.interval_seconds,
           updated_by = excluded.updated_by,
           updated_time = now()`,
    [target, intervalSeconds, userId]
  )
}
