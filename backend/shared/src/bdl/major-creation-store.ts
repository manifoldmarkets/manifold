import { storedGameDayEnd } from 'common/bdl/game-day'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { BDL_REISSUED_EVENT_MATCH_WINDOW_MS } from 'common/bdl/constants'
import { MajorLeague } from 'common/bdl/major-leagues'
import { SPORT_LEAGUE_LABEL } from 'common/sports-calendar'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import type { SupabaseTransaction } from '../supabase/init'
import { sportsProviderSql } from '../supabase/sports-provider'

type ReadDb = Pick<SupabaseTransaction, 'manyOrNone'>

export async function existingMajorGroups(
  pg: ReadDb,
  slugs: readonly string[]
) {
  const rows = await pg.manyOrNone<{ id: string; slug: string }>(
    `select id, slug from groups where slug = any($1::text[])
       and privacy_status in ('public','curated')`,
    [slugs]
  )
  const ids = new Map(rows.map((row) => [row.slug, row.id]))
  return slugs.every((slug) => ids.has(slug))
    ? [...new Set(slugs.map((slug) => ids.get(slug)!))]
    : null
}

type StoredGame = {
  id: string
  source: string
  start: string | null
  date_only: boolean | null
  latest_start: string | null
  observed_start: string | null
}

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
    `select c.id, ${sportsProviderSql()} as source, c.data->>'sportsStartTimestamp' as start,
              c.data->>'sportsStartKnown' = 'false' as date_only,
              c.data->>'sportsLatestPossibleStartTimestamp' as latest_start,
              c.data->>'sportsObservedStartTime' as observed_start
       from contracts c
      where c.creator_id = any($1) and c.token = 'MANA' and c.resolution is null
        and c.deleted is not true and c.data->>'sportsMarketType' = 'moneyline'
        and c.data->>'sportsFixture' is distinct from 'true' and (
          (${sportsProviderSql()} = 'odds' and c.data->>'sportsLeague' = $2
           and (c.close_time is null or c.close_time > $3)) or
          (c.data->>'sportsProvider' = 'bdl' and c.data->>'sportsLeagueKey' = $4
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
    ]
  )
  let beforeOpenOdds = false
  for (const row of rows) {
    const other = parseSportsKickoffMs(row.start ?? undefined)
    const observed =
      row.observed_start && /^\d{1,15}$/.test(row.observed_start)
        ? Number(row.observed_start)
        : NaN
    const started = observed > 0 && observed <= now
    if (
      row.source === 'bdl' &&
      (started || other <= now) &&
      ((started &&
        Math.abs(start - observed) <= BDL_REISSUED_EVENT_MATCH_WINDOW_MS) ||
        start -
          Math.min(
            now,
            storedGameDayEnd(other, row.date_only, row.latest_start)
          ) <=
          BDL_REISSUED_EVENT_MATCH_WINDOW_MS)
    )
      return 'possible-reid: ' + row.id
    if (row.source === 'odds' && start < other) beforeOpenOdds = true
  }
  return beforeOpenOdds ? 'before latest open Odds kickoff' : null
}
