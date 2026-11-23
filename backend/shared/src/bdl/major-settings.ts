import { BDL_LEAGUE_KEYS, isBdlLeagueKey } from 'common/bdl/leagues'
import {
  MAJOR_LEAGUES,
  MAJOR_WAVES,
  MajorLeague,
  MajorSettingRow,
  MajorSettings,
} from 'common/bdl/major-leagues'
import { APIError } from 'common/api/utils'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { isEqual } from 'lodash'
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

/** Serialize budget changes with both creation writers and record the operator. */
export async function existingMajorGroups(
  pg: Pick<SupabaseDirectClient, 'manyOrNone'>,
  slugs: readonly string[],
  lock = false
) {
  const rows = await pg.manyOrNone<{ id: string; slug: string }>(
    `select id, slug from groups where slug = any($1::text[])
       and privacy_status in ('public','curated') ${
         lock ? 'order by id for share' : ''
       }`,
    [slugs]
  )
  const ids = new Map(rows.map((row) => [row.slug, row.id]))
  return slugs.every((slug) => ids.has(slug))
    ? [...new Set(slugs.map((slug) => ids.get(slug)!))]
    : null
}

export async function saveCreationSetting(
  pg: Pick<SupabaseDirectClient, 'tx'>,
  row: MajorSettingRow,
  userId: string,
  expected: MajorSettingRow | null = null
) {
  if (!isBdlLeagueKey(row.scope) && !sharedScopes.includes(row.scope))
    throw new Error('Unknown sports creation scope')
  await pg.tx(async (tx) => {
    await tx.one(SPORTS_CREATION_BUDGET_LOCK_SQL)
    const [stored] = await creationSettings(tx, [row.scope])
    if (!isEqual(stored ?? null, expected))
      throw new APIError(
        409,
        'Budget changed. Reload the current values before saving.'
      )
    if (
      row.groupSlugs &&
      !isEqual(row.groupSlugs, stored?.groupSlugs) &&
      !(await existingMajorGroups(tx, row.groupSlugs, true))
    )
      throw new APIError(
        400,
        'One or more topics are missing or private. Choose public or curated topics.'
      )
    if (!isSportsBdlEnabled()) throw new APIError(404, 'Sports BDL disabled')
    await tx.none(
      `insert into sports_creation_settings (scope, ante_cap, base_ante, starts_on, group_slugs, updated_by)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (scope) do update set ante_cap = excluded.ante_cap,
         base_ante = excluded.base_ante, starts_on = excluded.starts_on,
         group_slugs = excluded.group_slugs, updated_by = excluded.updated_by, updated_at = now()`,
      [row.scope, row.cap, row.baseAnte, row.startsOn, row.groupSlugs, userId]
    )
  })
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
