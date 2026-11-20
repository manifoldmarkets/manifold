import {
  MAJOR_LEAGUES,
  MAJOR_WAVES,
  MajorLeague,
  MajorSettingRow,
  MajorSettings,
} from 'common/bdl/major-leagues'
import type { SupabaseDirectClient } from '../supabase/init'

export const BDL_CREATION_BUDGET_LOCK_SQL =
  "select pg_advisory_xact_lock(hashtext('sports-bdl-creation-budget'))"
export type { MajorSettings }
type CreationSetting = MajorSettingRow

export function creationSettings(
  pg: Pick<SupabaseDirectClient, 'manyOrNone'>,
  scopes?: string[]
) {
  return pg.manyOrNone<CreationSetting>(
    `select scope, ante_cap as cap, base_ante as "baseAnte",
       to_char(cutover_date,'YYYY-MM-DD') as "cutoverDate", group_slugs as "groupSlugs"
     from sports_bdl_creation_settings where ($1::text[] is null or scope = any($1))
     order by scope`,
    [scopes ?? null]
  )
}

export async function getMajorSettings(
  pg: Pick<SupabaseDirectClient, 'manyOrNone'>,
  league: MajorLeague
): Promise<MajorSettings | null> {
  const wave = MAJOR_WAVES[league]
  const settings = await creationSettings(pg, [
    league,
    'wave:' + wave,
    'global',
  ])
  const local = settings.find((s) => s.scope === league)
  const waveLimit = settings.find((s) => s.scope === 'wave:' + wave)
  const global = settings.find((s) => s.scope === 'global')
  if (
    !local?.baseAnte ||
    !local.cutoverDate ||
    !local.groupSlugs?.length ||
    !waveLimit ||
    !global
  )
    return null
  return {
    league,
    baseAnte: local.baseAnte,
    cutoverDate: local.cutoverDate,
    groupSlugs: local.groupSlugs,
    waveLeagueKeys: MAJOR_LEAGUES.filter((key) => MAJOR_WAVES[key] === wave),
    limits: {
      perLeagueDailyAnte: local.cap,
      perWaveAnte: waveLimit.cap,
      globalOpenAnte: global.cap,
    },
  }
}
