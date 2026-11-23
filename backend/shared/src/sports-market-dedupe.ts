import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { BDL_OPEN_ODDS_MATCH_WINDOW_MS } from 'common/bdl/constants'
import { BDL_LEAGUES, BdlLeagueKey } from 'common/bdl/leagues'
import { MULTI_CPMM_MECHANISMS_SQL } from 'common/contract'
import { isMajorLeague } from 'common/bdl/major-leagues'
import {
  isMajorOddsEvent,
  majorOddsKeys,
  majorOddsMoneylineSql,
} from './bdl/major-moneyline-identity'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { SPORT_LEAGUE_LABEL, SportId } from 'common/sports-calendar'
import { providerOf, SportsProvider } from 'common/sports-provider'
import { parseBdlEventId } from 'common/sports-ids'
import { sportForLeague } from 'common/sports-score-polling'
import { parseSportsKickoffMs } from 'common/sports-kickoff-interface'
import { DAY_MS } from 'common/util/time'
import { normalizeTeam } from 'common/sports-team-colors'

import type { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'
import { sportsProviderSql } from './supabase/sports-provider'

/** Legacy pipelines may regenerate a cancelled market. BDL reserves it by event and type. */
export const findSportsMarket = (
  pg: Pick<SupabaseDirectClient, 'oneOrNone'>,
  eventId: string,
  marketType: string,
  includeCanceled = false
) => {
  const historicOdds =
    isSportsBdlEnabled() &&
    marketType === 'moneyline' &&
    isMajorOddsEvent(eventId)
  return pg.oneOrNone<{ id: string }>(
    `select id from contracts c
     where data->>'sportsEventId' = $1
       and creator_id = any($2)
       and token = 'MANA'
       ${includeCanceled ? '' : "and resolution is distinct from 'CANCEL'"}
       ${
         historicOdds
           ? `and data->>'sportsFixture' is distinct from 'true' and ${sportsProviderSql()} = 'odds'`
           : ''
       }
       and (data->>'sportsMarketType' = $3
         ${
           historicOdds
             ? `or (data->>'sportsMarketType' is null and c.mechanism in ${MULTI_CPMM_MECHANISMS_SQL})`
             : ''
         })
     limit 1`,
    [eventId, MANIFOLD_SPORTS_USER_IDS, marketType]
  )
}

type Market = {
  sportsEventId: string
  sportsProvider?: SportsProvider
  sportsLeagueKey?: BdlLeagueKey
  sportsLeague: string
  sportsHomeTeam?: string
  sportsAwayTeam?: string
  sportsStartTimestamp: string
}

const easternDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function knownTeam(name: string | null | undefined) {
  const normalized = normalizeTeam(name ?? '')
  return /^(?:tbd|tba|to be determined|to be announced)$/.test(normalized)
    ? ''
    : normalized
}

export class UnidentifiedSportsMoneyline extends Error {}

function teamPair(
  home: string | null | undefined,
  away: string | null | undefined
) {
  if (!home || !away) return
  const a = knownTeam(home),
    b = knownTeam(away)
  if (!a || !b || a === b) return
  return [a, b].sort().join(':')
}

export type OppositeMoneyline = {
  trading: boolean
  id: string
  home: string | null
  away: string | null
  start: string | null
}

/** An unresolved postponement can cross midnight after native trading closes. */
export function sameNearbyMoneyline(
  row: OppositeMoneyline,
  home: string | undefined,
  away: string | undefined,
  start: number
) {
  const otherStart = parseSportsKickoffMs(row.start ?? undefined)
  const pair = teamPair(row.home, row.away)
  return (
    !!pair &&
    pair === teamPair(home, away) &&
    Math.abs(start - otherStart) <= DAY_MS
  )
}

/** Call inside the same transaction as the insert and the ante. The Odds pipeline
 * participates in the matchup lock but may still create its distinct event IDs.
 * During a BDL phase, both providers also check the other's unresolved games. */
export async function findLockedSportsMarket(
  tx: Pick<SupabaseTransaction, 'one' | 'oneOrNone' | 'manyOrNone'>,
  candidate: Market,
  marketType: string,
  allowCanceledEventId?: string,
  checkOpenBdl = false
) {
  const bdl = candidate.sportsProvider === 'bdl'
  const lock = (key: string) =>
    tx.one('select pg_advisory_xact_lock(hashtext($1))', [key])
  await lock(`sports-${marketType}:${candidate.sportsEventId}`)
  const exact = await findSportsMarket(
    tx,
    candidate.sportsEventId,
    marketType,
    bdl &&
      !(
        marketType === 'moneyline' &&
        allowCanceledEventId === candidate.sportsEventId
      )
  )
  if (exact || marketType !== 'moneyline') return exact
  if (!bdl && (!isSportsBdlEnabled() || providerOf(candidate) !== 'odds'))
    return null

  const sport: SportId | null | undefined = bdl
    ? candidate.sportsLeagueKey &&
      BDL_LEAGUES[candidate.sportsLeagueKey]?.sportId
    : sportForLeague(candidate.sportsLeague)
  if (bdl && sport && isMajorLeague(sport) && isSportsBdlEnabled()) {
    const event = parseBdlEventId(candidate.sportsEventId)
    if (
      event?.league !== candidate.sportsLeagueKey ||
      !event ||
      'suffix' in event
    )
      throw new UnidentifiedSportsMoneyline(
        'Unverified BDL moneyline event identity'
      )
  }
  const teams = teamPair(candidate.sportsHomeTeam, candidate.sportsAwayTeam)
  const start = Date.parse(candidate.sportsStartTimestamp)
  if (!sport || !teams || !Number.isFinite(start)) {
    if (bdl || checkOpenBdl)
      throw new UnidentifiedSportsMoneyline(
        'BDL cutover moneyline needs a known sport, two identifiable teams and a kickoff for deduplication'
      )
    return null
  }
  // The six-hour window can cross Eastern midnight. Lock all touched dates in
  // the same order so overlapping runs coordinate at midnight and across DST.
  const lockDays = [
    ...new Set(
      [-1, 0, 1].map((offset) =>
        easternDate.format(start + offset * BDL_OPEN_ODDS_MATCH_WINDOW_MS)
      )
    ),
  ].sort()
  for (const day of lockDays)
    await lock(`sports-moneyline:${sport}:${day}:${teams}`)
  if (!bdl && !checkOpenBdl) return null

  // Read the kickoff recorded on the contract. Its close time can differ, e.g.
  // after a manual change. Normalize both sides in TS using the same team rules.
  const historicOdds = bdl && isMajorLeague(sport) && isSportsBdlEnabled()
  const classification = historicOdds
    ? majorOddsMoneylineSql('$2', '$4')
    : "c.data->>'sportsLeague' = $2 and c.data->>'sportsMarketType' = 'moneyline'"
  const cutover = historicOdds || checkOpenBdl
  const trading = '(c.close_time is null or c.close_time > now())'
  const rows = await tx.manyOrNone<OppositeMoneyline>(
    `select c.id, c.data->>'sportsHomeTeam' as home, c.data->>'sportsAwayTeam' as away,
            c.data->>'sportsStartTimestamp' as start, ${trading} as trading
       from contracts c
      where c.creator_id = any($1) and c.token = 'MANA'
        and c.resolution is null and c.deleted is not true
        ${cutover ? '' : `and ${trading}`}
        and (${classification})
        and c.data->>'sportsFixture' is distinct from 'true'
        and ${sportsProviderSql()} = $3
      order by c.id`,
    [
      MANIFOLD_SPORTS_USER_IDS,
      SPORT_LEAGUE_LABEL[sport],
      bdl ? 'odds' : 'bdl',
      majorOddsKeys(sport),
    ]
  )
  const candidates = [
    normalizeTeam(candidate.sportsHomeTeam!),
    normalizeTeam(candidate.sportsAwayTeam!),
  ]
  return (
    rows.find((row) => {
      if (!row.trading)
        return sameNearbyMoneyline(
          row,
          candidate.sportsHomeTeam,
          candidate.sportsAwayTeam,
          start
        )
      // A shifted kickoff cannot distinguish a second game across providers.
      // Keep the open market reserved until its opponents rule out this matchup.
      if (!cutover) {
        const otherStart = Date.parse(row.start ?? '')
        if (!(Math.abs(start - otherStart) <= BDL_OPEN_ODDS_MATCH_WINDOW_MS))
          return false
      }
      const pair = teamPair(row.home, row.away)
      if (pair) return pair === teams
      // Without both opponents, allow funding only when a known side rules this game out.
      return (
        cutover &&
        [row.home, row.away].every((name) => {
          const known = knownTeam(name)
          return !known || candidates.includes(known)
        })
      )
    }) ?? null
  )
}
