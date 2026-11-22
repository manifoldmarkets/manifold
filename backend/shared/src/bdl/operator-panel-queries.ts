import { calendarLeague, uniqueLeagueForSport } from './calendar-league'
import { BDL_LEAGUES, BDL_LEAGUE_KEYS } from 'common/bdl/leagues'
import type {
  BdlOperatorLeague,
  BdlOperatorPanel,
  BdlOperatorRequests,
} from 'common/bdl/operator-panel'
import { MULTI_CPMM_MECHANISMS_SQL } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  autoCreates,
  SPORTS_CALENDAR,
  SPORT_LEAGUE_LABEL,
} from 'common/sports-calendar'
import type { SupabaseDirectClient } from '../supabase/init'
import { getCompetitionSwitches } from '../supabase/sports-competition-switches'
import { sportsProviderSql } from '../supabase/sports-provider'

type RequestRow = Omit<BdlOperatorRequests, 'lastSuccess' | 'lastRequest'> & {
  league: string
  lastRequest: string | Date
  lastSuccess: string | Date | null
}
type Inventory = {
  oddsKey: string | null
  legacyLabel: string | null
  trading: boolean
  count: number
}

export async function getBdlOperatorPanel(
  pg: SupabaseDirectClient,
  asOf = new Date()
): Promise<BdlOperatorPanel> {
  const [switches, inventory, requests] = await Promise.all([
    getCompetitionSwitches(pg),
    pg.manyOrNone<Inventory>(
      `with unresolved_odds as (
        select c.data->>'sportsEventId' as event, c.data->>'sportsLeague' as label,
          (c.close_time is null or c.close_time > $2::timestamptz) as trading
        from contracts c
        where c.creator_id = any($1) and c.token = 'MANA' and c.visibility = 'public'
          and c.resolution is null and c.deleted is not true
          and (c.data->>'sportsMarketType' = 'moneyline' or (
            c.data->>'sportsMarketType' is null and c.mechanism in ${MULTI_CPMM_MECHANISMS_SQL}
            and c.data->>'sportsEventId' ~ '^odds:[^:]+:.+$'
          ))
          and c.data->>'sportsFixture' is distinct from 'true'
          and not starts_with(c.data->>'sportsEventId', 'fixture:')
          and ${sportsProviderSql()} = 'odds'
      )
      select substring(event from '^odds:([^:]+):.+$') as "oddsKey",
        case when event <> '' and event !~ '^(odds:|bdl[-:]|fd-)' then label end as "legacyLabel",
        trading, count(*)::int as count
      from unresolved_odds group by 1, 2, 3`,
      [MANIFOLD_SPORTS_USER_IDS, asOf]
    ),
    pg.manyOrNone<RequestRow>(
      `select provider, league_key as league, endpoint_template as endpoint, process_role as role,
         last_success_at as "lastSuccess", last_request_at as "lastRequest", last_status as status,
         success_count::text as successes, unauthorized_count::text as unauthorized,
         rate_limited_count::text as throttled, other_count::text as other,
         quota_remaining as remaining, quota_limit as "limit"
       from sports_provider_request_stats order by league_key, provider, endpoint_template, process_role`
    ),
  ])

  // Keep configured BDL leagues first, then include leagues reported by other providers.
  const keys = new Set<string>([
    ...BDL_LEAGUE_KEYS,
    ...requests.map((row) => row.league),
  ])
  const leagues = new Map<string, BdlOperatorLeague>(
    Array.from(keys, (league) => [
      league,
      {
        league,
        openOdds: null,
        closedOdds: null,
        phases: [],
        requests: [],
        vendorFreshness: null,
        recorderStatus: null,
      },
    ])
  )
  const byKey = new Map<string, BdlOperatorLeague>()
  // Historical contracts with an untyped event ID and an explicit Odds provider may have only a league label.
  const byLabel = new Map<string, BdlOperatorLeague>()
  for (const phase of SPORTS_CALENDAR) {
    if (!phase.oddsKey && !phase.provider) continue
    const key = calendarLeague(phase)
    if (!key) continue
    const row = leagues.get(key)!
    row.phases.push({
      competitionId: phase.competitionId,
      competition: phase.competition,
      phase: phase.phase,
      startDate: phase.startDate,
      endDate: phase.endDate,
      provider: phase.provider ? 'bdl' : 'odds',
      on: autoCreates(phase, switches),
      defaultOn: autoCreates(phase, {}),
      locked: phase.locked,
    })
    if (phase.oddsKey && !phase.provider) {
      row.openOdds = 0
      row.closedOdds = 0
      byKey.set(phase.oddsKey, row)
      const sport = BDL_LEAGUES[key].sportId
      if (uniqueLeagueForSport(sport))
        byLabel.set(SPORT_LEAGUE_LABEL[sport], row)
    }
  }
  for (const { oddsKey, legacyLabel, trading, count } of inventory) {
    const row = oddsKey
      ? byKey.get(oddsKey)
      : legacyLabel
      ? byLabel.get(legacyLabel)
      : undefined
    if (row) {
      const field = trading ? 'openOdds' : 'closedOdds'
      row[field] = (row[field] ?? 0) + count
    }
  }
  for (const { league, lastRequest, lastSuccess, ...counts } of requests) {
    leagues.get(league)!.requests.push({
      ...counts,
      lastRequest: new Date(lastRequest).toISOString(),
      lastSuccess: lastSuccess && new Date(lastSuccess).toISOString(),
    })
  }
  return { leagues: [...leagues.values()] }
}
