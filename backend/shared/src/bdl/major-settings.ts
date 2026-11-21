import { BDL_LEAGUE_KEYS, isBdlLeagueKey } from 'common/bdl/leagues'
import {
  MAJOR_LEAGUES,
  MAJOR_WAVES,
  MajorLeague,
  MajorSettingRow,
  MajorSettings,
} from 'common/bdl/major-leagues'
import type { SupabaseDirectClient } from '../supabase/init'

export const SPORTS_CREATION_BUDGET_LOCK_SQL =
  "select pg_advisory_xact_lock(hashtext('sports-creation-budget'))"
export type { MajorSettings }
const sharedScopes = ['global', 'wave:1', 'wave:2', 'wave:3']
const knownScopes = [...BDL_LEAGUE_KEYS, ...sharedScopes]

export async function creationSettings(
  pg: Pick<SupabaseDirectClient, 'manyOrNone'>,
  scopes: readonly string[] = knownScopes
) {
  if (
    scopes.some(
      (scope) => !isBdlLeagueKey(scope) && !sharedScopes.includes(scope)
    )
  )
    throw new Error('Unknown sports creation scope')
  return pg.manyOrNone<MajorSettingRow>(
    `select scope, ante_cap as cap, base_ante as "baseAnte",
       to_char(starts_on,'YYYY-MM-DD') as "startsOn", group_slugs as "groupSlugs"
     from sports_creation_settings where scope = any($1::text[])
     order by scope`,
    [scopes]
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
    !local.startsOn ||
    !local.groupSlugs?.length ||
    !waveLimit ||
    !global
  )
    return null
  return {
    league,
    baseAnte: local.baseAnte,
    startsOn: local.startsOn,
    groupSlugs: local.groupSlugs,
    waveLeagueKeys: MAJOR_LEAGUES.filter((key) => MAJOR_WAVES[key] === wave),
    limits: {
      perLeagueDailyAnte: local.cap,
      perWaveAnte: waveLimit.cap,
      globalOpenAnte: global.cap,
    },
  }
}
