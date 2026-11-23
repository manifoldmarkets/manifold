import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { BDL_REISSUED_EVENT_MATCH_WINDOW_MS } from 'common/bdl/constants'
import {
  majorOddsKeys,
  majorOddsMoneylineSql,
} from './major-moneyline-identity'
import { MAX_CREATION_GAME_KEYS, MajorLeague } from 'common/bdl/major-leagues'
import { SPORT_LEAGUE_LABEL } from 'common/sports-calendar'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import type { SupabaseTransaction } from '../supabase/init'
import { sportsProviderSql } from '../supabase/sports-provider'

type ReadDb = Pick<SupabaseTransaction, 'manyOrNone'>

export { existingMajorGroups } from './major-settings'

// Called under the native event lock by both forced preview and selected creation.
export async function canceledMajorContractIds(
  pg: ReadDb,
  eventId: string,
  league: MajorLeague
) {
  const rows = await pg.manyOrNone<{
    id: string
    resolution: string | null
    verified: boolean
  }>(
    `select id, resolution, (data @> $3::jsonb and data->>'sportsFixture' is distinct from 'true') as verified
     from contracts where data->>'sportsEventId'=$1 and creator_id=any($2) and token='MANA'
       and data->>'sportsMarketType'='moneyline' order by id collate "C" limit $4 for share`,
    [
      eventId,
      MANIFOLD_SPORTS_USER_IDS,
      JSON.stringify({ sportsProvider: 'bdl', sportsLeagueKey: league }),
      MAX_CREATION_GAME_KEYS + 1,
    ]
  )
  if (
    rows.length > MAX_CREATION_GAME_KEYS ||
    rows.some((r) => !r.verified || r.resolution !== 'CANCEL')
  )
    return null
  return rows.map((r) => r.id)
}

type StoredGame = { id: string; source: string; start: string | null }

/** A prior BDL ID only blocks a replacement once it has started and a complete
 * schedule scan covering its date cannot find it. The same teams can play again. */
export async function majorCreationHold(
  pg: ReadDb,
  input: {
    league: MajorLeague
    homeId: number
    awayId: number
    eventId: string
    start: number
    now: number
    seenEventIds: readonly string[]
  }
): Promise<string | null> {
  const { league, homeId, awayId, eventId, start, now, seenEventIds } = input
  const rows = await pg.manyOrNone<StoredGame>(
    `select c.id, ${sportsProviderSql()} as source, c.data->>'sportsStartTimestamp' as start
       from contracts c
      where c.creator_id = any($1) and c.token = 'MANA' and c.resolution is null
        and c.deleted is not true
        and c.data->>'sportsFixture' is distinct from 'true' and (
          (${sportsProviderSql()} = 'odds' and ${majorOddsMoneylineSql(
      '$2',
      '$9'
    )}
           and (c.close_time is null or c.close_time > $3)) or
          (c.data->>'sportsProvider' = 'bdl' and c.data->>'sportsMarketType' = 'moneyline' and c.data->>'sportsLeagueKey' = $4
           and c.data->>'sportsEventId' <> $5
           and not (c.data->>'sportsEventId' = any($6::text[]))
           and ((c.data->>'sportsHomeTeamId' = $7 and c.data->>'sportsAwayTeamId' = $8)
             or (c.data->>'sportsHomeTeamId' = $8 and c.data->>'sportsAwayTeamId' = $7))))`,
    [
      MANIFOLD_SPORTS_USER_IDS,
      SPORT_LEAGUE_LABEL[league],
      new Date(now),
      league,
      eventId,
      seenEventIds,
      String(homeId),
      String(awayId),
      majorOddsKeys(league),
    ]
  )
  let beforeOpenOdds = false
  for (const row of rows) {
    const other = parseSportsKickoffMs(row.start ?? undefined)
    if (
      row.source === 'bdl' &&
      other <= now &&
      start - other <= BDL_REISSUED_EVENT_MATCH_WINDOW_MS
    )
      return 'possible-reid: ' + row.id
    if (row.source === 'odds' && start < other) beforeOpenOdds = true
  }
  return beforeOpenOdds ? 'before latest open Odds kickoff' : null
}
