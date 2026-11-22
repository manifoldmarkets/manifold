import {
  BDL_LEAGUES,
  BDL_LEAGUE_KEYS,
  type BdlLeagueKey,
} from 'common/bdl/leagues'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { contractPathWithoutContract } from 'common/contract'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { SPORTS_CALENDAR, SPORT_ID_TO_SPORT_KEY } from 'common/sports-calendar'
import { getSportsLeagueLabel } from 'common/sports-league-label'
import type {
  SportsResult,
  SportsResultsPage,
  SportsResultsProps,
} from 'common/sports-results'
import { splitFlag } from 'common/sports-schedule'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { officialSportsGameSql } from 'shared/supabase/official-sports-game'
import type { APIHandler } from './helpers/endpoint'

type ResultSource = { sport: string; league?: BdlLeagueKey; label?: string }

function resultSources() {
  const sources = new Map<string, ResultSource>()
  const leagueByLabel = new Map<string, BdlLeagueKey>()
  for (const key of BDL_LEAGUE_KEYS) {
    const league = BDL_LEAGUES[key]
    sources.set('bdl:' + key, {
      sport: league.sportKey,
      league: key,
      label: league.shortLabel,
    })
    for (const label of [key, league.label, league.shortLabel])
      leagueByLabel.set(label.toLowerCase(), key)
  }
  sources.set('football-data', {
    sport: 'soccer',
    league: 'fifa/worldcup',
    label: 'WC26',
  })
  for (const { oddsKey, sport } of SPORTS_CALENDAR) {
    if (!oddsKey || sources.has('odds:' + oddsKey)) continue
    const label = getSportsLeagueLabel({
      creatorId: MANIFOLD_SPORTS_USER_IDS[0],
      sportsEventId: 'odds:' + oddsKey + ':game',
    })
    sources.set('odds:' + oddsKey, {
      sport: SPORT_ID_TO_SPORT_KEY[sport],
      league: label ? leagueByLabel.get(label.toLowerCase()) : undefined,
      label,
    })
  }
  return sources
}

const sources = resultSources()
const sourceLeagueKeys = Object.fromEntries(
  [...sources].map(([key, value]) => [key, value.league])
)
// Event namespaces predate the optional league metadata on stored contracts.
const sourceSql = `case when starts_with(c.data->>'sportsEventId', 'fd-') then 'football-data'
  when starts_with(c.data->>'sportsEventId','bdl-f1:') then 'bdl:f1'
  when starts_with(c.data->>'sportsEventId','bdl:ncaab-bracket:') then 'bdl:ncaab'
  else split_part(c.data->>'sportsEventId',':',1) || ':' || split_part(c.data->>'sportsEventId',':',2) end`

type Row = {
  id: string
  question: string
  slug: string
  username: string
  source: string
  stamp: string
  resolution: string
  resolutions: unknown
  answers: { id: string; name: string; position: number }[] | null
  groupSlugs: string[] | null
  liveStatus: string | null
  home: string | null
  away: string | null
  homeScore: unknown
  awayScore: unknown
  duration: string | null
  penHome: unknown
  penAway: unknown
}

function marketOutcome(row: Row): string {
  if (row.resolution === 'CANCEL') return 'N/A (refunded)'
  const answers = row.answers ?? []
  if (row.resolution !== 'CHOOSE_MULTIPLE')
    return answers.find((a) => a.id === row.resolution)?.name || 'Settled'

  if (
    !row.resolutions ||
    typeof row.resolutions !== 'object' ||
    Array.isArray(row.resolutions)
  )
    return 'Settled'
  const payouts = new Map<string, number>()
  for (const [id, value] of Object.entries(row.resolutions)) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100 ||
      !answers.some((a) => a.id === id && !!a.name)
    )
      return 'Settled'
    if (value > 0) payouts.set(id, value)
  }
  const total = [...payouts.values()].reduce((sum, pct) => sum + pct, 0)
  // The resolver accepts rounded input within 0.1 of 100 and normalizes it before payout.
  const roundingError = Number.EPSILON * 100 * payouts.size
  if (Math.abs(total - 100) > 0.1 + roundingError) return 'Settled'
  const paid = answers.filter((a) => payouts.has(a.id))
  if (paid.length === 1) return paid[0].name
  return paid
    .map(
      (a) =>
        a.name +
        ' ' +
        Number(((100 * payouts.get(a.id)!) / total).toFixed(2)) +
        '%'
    )
    .join(' · ')
}

function finalScore(row: Row): SportsResult['finalScore'] {
  const score = (n: unknown): n is number =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  if (
    row.resolution === 'CANCEL' ||
    !/^(FINAL|FINISHED|AWARDED)$/i.test(row.liveStatus ?? '') ||
    !score(row.homeScore) ||
    !score(row.awayScore)
  )
    return null
  // Football-data's World Cup builder stores home then away in the answer list.
  const oldTeams = row.source === 'football-data' ? row.answers : null
  const home = row.home || oldTeams?.find((a) => a.position === 0)?.name
  const away = row.away || oldTeams?.find((a) => a.position === 1)?.name
  const homeName = splitFlag(home ?? '').name.normalize('NFC')
  const awayName = splitFlag(away ?? '').name.normalize('NFC')
  if (
    !homeName ||
    !awayName ||
    homeName.toLowerCase() === awayName.toLowerCase()
  )
    return null
  const shootout = row.duration === 'PENALTY_SHOOTOUT'
  if (shootout && row.homeScore !== row.awayScore) return null
  return {
    home: homeName,
    homeScore: row.homeScore,
    away: awayName,
    awayScore: row.awayScore,
    ...(shootout
      ? { qualifier: 'penalties' as const }
      : row.duration === 'EXTRA_TIME'
      ? { qualifier: 'extra-time' as const }
      : {}),
    ...(shootout &&
    score(row.penHome) &&
    score(row.penAway) &&
    row.penHome !== row.penAway
      ? { penalties: { home: row.penHome, away: row.penAway } }
      : {}),
  }
}

export async function readSportsResults(
  pg: Pick<ReturnType<typeof createSupabaseDirectClient>, 'manyOrNone'>,
  props: SportsResultsProps
): Promise<SportsResultsPage> {
  const keys = [...sources]
    .filter(
      ([, s]) =>
        s.sport === props.sport && (!props.league || s.league === props.league)
    )
    .map(([key]) => key)
  if (!keys.length) return { items: [], nextCursor: null }
  const limit = props.limit ?? 25
  const [before, beforeId] = props.cursor?.split('|') ?? []
  const rows = await pg.manyOrNone<Row>(
    `select c.id,c.slug,c.question,c.data->>'creatorUsername' as username,c.resolution,
     ${sourceSql} as source, to_char(c.resolution_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as stamp,
     c.data->'resolutions' as resolutions,c.group_slugs as "groupSlugs",c.data->>'sportsLiveStatus' as "liveStatus",
     c.data->>'sportsHomeTeam' as home,c.data->>'sportsAwayTeam' as away,
     c.data->'sportsHomeScore' as "homeScore",c.data->'sportsAwayScore' as "awayScore",
     c.data->>'sportsScoreDuration' as duration,c.data->'sportsPenHome' as "penHome",c.data->'sportsPenAway' as "penAway",
     (select jsonb_agg(jsonb_build_object('id',a.id,'name',a.text,'position',a.index) order by a.index,a.id)
        from answers a where a.contract_id=c.id) as answers
     from contracts c
     where c.creator_id=any($1) and c.visibility='public' and c.token='MANA'
       and c.deleted is not true and c.resolution is not null and c.resolution_time is not null
       and c.outcome_type='MULTIPLE_CHOICE' and ${officialSportsGameSql('c')}
       and coalesce(c.data->>'sportsMarketType','moneyline') in ('moneyline','winner')
       and (${sourceSql})=any($2)
       and (c.data->>'sportsLeagueKey' is null or c.data->>'sportsLeagueKey' = ($6::jsonb ->> (${sourceSql})))
       and c.data->>'creatorUsername' ~ '^[A-Za-z0-9_-]+$' and c.slug ~ '^[A-Za-z0-9_-]+$'
       and ($3::timestamptz is null or (c.resolution_time,c.id collate "C") < ($3::timestamptz,$4::text collate "C"))
     order by c.resolution_time desc,c.id collate "C" desc limit $5`,
    [
      MANIFOLD_SPORTS_USER_IDS,
      keys,
      before ?? null,
      beforeId ?? null,
      limit + 1,
      JSON.stringify(sourceLeagueKeys),
    ]
  )
  const page = rows.slice(0, limit)
  const items = page.map((row) => ({
    id: row.id,
    href: contractPathWithoutContract(row.username, row.slug),
    question: row.question,
    league: sources.get(row.source)?.label ?? null,
    settledAt: Date.parse(row.stamp),
    payout: marketOutcome(row),
    finalScore: finalScore(row),
    groupSlugs: row.groupSlugs ?? [],
  }))
  const last = page[page.length - 1]
  return {
    items,
    nextCursor: rows.length > limit ? last.stamp + '|' + last.id : null,
  }
}

export const sportsResults: APIHandler<'sports-results'> = async (props) =>
  isSportsBdlEnabled()
    ? readSportsResults(createSupabaseDirectClient(), props)
    : { items: [], nextCursor: null }
