import { SupabaseDirectClient } from 'shared/supabase/init'
import { calendarPhaseKey, CompetitionSwitches } from 'common/sports-calendar'

// The scheduler switches admins set on /admin/sports, one row per calendar
// phase. A phase without a row runs on its `autoCreate` default.

export interface CompetitionSwitchRow {
  competitionId: string
  phase: string
  on: boolean
  updatedBy: string
  updatedTime: number
}

export function getCompetitionSwitchRows(
  pg: SupabaseDirectClient
): Promise<CompetitionSwitchRow[]> {
  return pg.map(
    `select competition_id, phase, enabled, updated_by, updated_time
       from sports_competition_switches`,
    [],
    (r) => ({
      competitionId: r.competition_id,
      phase: r.phase,
      on: r.enabled,
      updatedBy: r.updated_by,
      updatedTime: new Date(r.updated_time).getTime(),
    })
  )
}

export async function getCompetitionSwitches(
  pg: SupabaseDirectClient
): Promise<CompetitionSwitches> {
  const rows = await getCompetitionSwitchRows(pg)
  return Object.fromEntries(rows.map((r) => [calendarPhaseKey(r), r.on]))
}

export async function setCompetitionSwitch(
  pg: SupabaseDirectClient,
  props: { competitionId: string; phase: string; on: boolean; userId: string }
) {
  await pg.none(
    `insert into sports_competition_switches
       (competition_id, phase, enabled, updated_by)
     values ($1, $2, $3, $4)
     on conflict (competition_id, phase) do update
       set enabled = excluded.enabled,
           updated_by = excluded.updated_by,
           updated_time = now()`,
    [props.competitionId, props.phase, props.on, props.userId]
  )
}
