import { groupBy, sortBy, uniq } from 'lodash'
import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect } from 'shared/utils'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { Contract } from 'common/contract'
import { Answer } from 'common/answer'
import { tsToMillis } from 'common/supabase/utils'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  ALL_SPORTS_GROUP_IDS,
  findRelatedMarkets,
  gameStatus,
  isDrawAnswer,
  parseSportsStart,
  RelatedCandidate,
  RelatedRef,
  ScheduleGame,
  ScheduleTeam,
  SportKey,
  sportForMarket,
  sportGroupIds,
  SportsScheduleResponse,
  SPORTS_DEFAULT_GROUP_ID,
  splitFlag,
  UpcomingMarketRef,
} from 'common/sports-schedule'
import { DAY_MS, HOUR_MS } from 'common/util/time'

// Game rows come from the automated pipelines only: markets created by the
// @ManifoldSports account that carry a sportsEventId. Recently finished games
// stick around for a while so the page can show final scores. Everything
// else people make in the sports topics either hangs under a game as a
// related market or shows up in the "this week" feed by close time.
const FINISHED_GRACE_HOURS = 18
const MAX_OFFICIAL_GAMES = 400
const MAX_CANDIDATES = 1000
const MAX_RELATED_PER_GAME = 25
const UPCOMING_DAYS = 7
const MAX_UPCOMING = 300
// The page loads these through markets-by-ids, which takes 100 ids at most.
const MAX_UPCOMING_RETURNED = 100

const MARKET_OUTCOME_TYPES =
  "'BINARY', 'MULTIPLE_CHOICE', 'NUMBER', 'MULTI_NUMERIC', 'PSEUDO_NUMERIC'"

type Pg = ReturnType<typeof createSupabaseDirectClient>

export const sportsSchedule: APIHandler<'sports-schedule'> = async (props) => {
  const sport = (props.sport ?? 'all') as SportKey | 'all'
  const daysAhead = props.daysAhead ?? 14
  const limit = props.limit ?? 120
  const pg = createSupabaseDirectClient()
  const now = Date.now()
  const horizon = now + daysAhead * DAY_MS

  const [official, weekAll] = await Promise.all([
    getOfficialGames(pg, daysAhead, now),
    getUpcomingMarkets(pg),
  ])
  const games = official.filter((g) => g.startTime < horizon)

  // Sort: live first (biggest games on top), then upcoming by kickoff, then
  // just-finished (most recent first).
  const ordered = sortBy(
    games,
    (g) => (g.status === 'live' ? 0 : g.status === 'upcoming' ? 1 : 2),
    (g) =>
      g.status === 'live'
        ? -g.volume
        : g.status === 'finished'
        ? -g.startTime
        : g.startTime
  )

  const filtered = (
    sport === 'all' ? ordered : ordered.filter((g) => g.sport === sport)
  ).slice(0, limit)

  // Attach related markets (props, totals, side-bets) to each game.
  const attached = new Set<string>()
  if (props.includeRelated !== false && filtered.length > 0) {
    const candidates = await getRelatedCandidates(pg, sport)
    const candidateClose = new Map(candidates.map((c) => [c.id, c.closeTime]))
    const matchesByGame = filtered.map((g) =>
      findRelatedMarkets(
        {
          id: g.id,
          sport: g.sport,
          sportsEventId: g.sportsEventId,
          startTime: g.startTime,
          home: { name: g.home.name, shortText: g.home.shortName },
          away: { name: g.away.name, shortText: g.away.shortName },
        },
        candidates,
        MAX_RELATED_PER_GAME * 2
      )
    )
    // A name-matched market (a series bet, a weekly rematch) can match several
    // games of the same fixture; keep it on the game whose kickoff is nearest
    // its close. Official (same event id) matches are already exact.
    const bestGameFor = new Map<string, { gameId: string; distance: number }>()
    filtered.forEach((g, i) => {
      for (const m of matchesByGame[i]) {
        if (m.kind === 'official') continue
        const close = candidateClose.get(m.id)
        const distance =
          close == null ? Infinity : Math.abs(close - g.startTime)
        const best = bestGameFor.get(m.id)
        if (!best || distance < best.distance) {
          bestGameFor.set(m.id, { gameId: g.id, distance })
        }
      }
    })
    filtered.forEach((g, i) => {
      const matches = matchesByGame[i]
        .filter(
          (m) => m.kind === 'official' || bestGameFor.get(m.id)?.gameId === g.id
        )
        .slice(0, MAX_RELATED_PER_GAME)
      g.related = matches.map(({ id, kind, group }) => ({ id, kind, group }))
      g.relatedCount = matches.length
      for (const m of matches) attached.add(m.id)
    })
  }

  // "This week": everything in the sports topics closing within a week that
  // is not a game row and not already hanging under one. For a sports market
  // the close time is the game time, so this is the schedule of what people
  // made, with no matching involved.
  const gameIds = new Set(official.map((g) => g.id))
  const upcoming = weekAll.filter(
    (m) => !gameIds.has(m.id) && !attached.has(m.id)
  )

  // Rail badges: live and upcoming games plus this week's markets, per sport.
  const counts: Partial<Record<SportKey, number>> = {}
  let liveCount = 0
  for (const g of ordered) {
    if (g.status === 'finished') continue
    counts[g.sport] = (counts[g.sport] ?? 0) + 1
    if (g.status === 'live') liveCount++
  }
  for (const m of upcoming) counts[m.sport] = (counts[m.sport] ?? 0) + 1

  const response: SportsScheduleResponse = {
    games: filtered,
    upcoming: (sport === 'all'
      ? upcoming
      : upcoming.filter((m) => m.sport === sport)
    ).slice(0, MAX_UPCOMING_RETURNED),
    counts,
    liveCount,
  }
  return response
}

// ─── Official (pipeline-created) games ────────────────────────────────────────

// Filtering and ordering use close_time (indexed, always a real timestamp)
// rather than casting the free-form sportsStartTimestamp in SQL, where one
// malformed value would fail the whole query. Kickoff is parsed in TS and
// games beyond the horizon are dropped there. Close is at most a few hours
// after kickoff, so one extra day of slack covers the difference.
//
// Anyone can stamp a sportsEventId through the API; only markets from the
// @ManifoldSports account are game rows.
async function getOfficialGames(
  pg: Pg,
  daysAhead: number,
  now: number
): Promise<ScheduleGame[]> {
  const rows = await pg.manyOrNone(
    `select ${contractColumnsToSelect}
     from contracts
     where data->>'sportsEventId' is not null
       and creator_id = any($2)
       and token = 'MANA'
       and visibility = 'public'
       and coalesce(deleted, false) = false
       and resolution is distinct from 'CANCEL'
       and close_time > now() - interval '${FINISHED_GRACE_HOURS} hours'
       and close_time < now() + ($1 || ' days')::interval + interval '1 day'
     order by close_time asc
     limit ${MAX_OFFICIAL_GAMES}`,
    [String(daysAhead), MANIFOLD_SPORTS_USER_IDS]
  )
  const contracts = rows.map((r) => convertContract(r))
  const ids = contracts.map((c) => c.id)
  const [answersByContract, groupIdsByContract] = await Promise.all([
    getAnswers(pg, ids),
    getGroupIds(pg, ids),
  ])
  return contracts
    .map((c) =>
      toOfficialGame(
        c,
        answersByContract[c.id] ?? [],
        groupIdsByContract[c.id] ?? [],
        now
      )
    )
    .filter((g): g is ScheduleGame => g !== null)
}

function toOfficialGame(
  c: Contract,
  answers: Answer[],
  groupIds: string[],
  now: number
): ScheduleGame | null {
  if (c.mechanism !== 'cpmm-multi-1') return null
  const d = c as any
  const sportsEventId: string | undefined = d.sportsEventId
  if (!sportsEventId) return null

  const ordered = sortBy(answers, 'index')
  const drawAnswer = ordered.find((a) => isDrawAnswer(a.text))
  const teams = ordered.filter((a) => a !== drawAnswer)
  if (teams.length !== 2) return null

  const kickoff = parseSportsStart(d.sportsStartTimestamp)
  // Without a parseable kickoff the close time is the only deadline we have
  // (the row then says "Closes").
  const closeTime = c.closeTime ?? (kickoff ?? now) + 3 * HOUR_MS
  const startTime = kickoff ?? closeTime
  const isResolved = !!c.resolution
  const liveStatus: string | null = d.sportsLiveStatus ?? null
  const liveUpdatedTime: number | null = d.sportsLiveUpdatedTime ?? null
  const status = gameStatus({
    startTime,
    closeTime,
    isResolved,
    liveStatus,
    liveUpdatedTime,
    now,
  })

  const homeScore: number | null = d.sportsHomeScore ?? null
  const awayScore: number | null = d.sportsAwayScore ?? null
  const liveScore =
    status === 'live' && liveStatus
      ? {
          home: homeScore,
          away: awayScore,
          minute: (d.sportsLiveMinute as string | null) ?? null,
          status: liveStatus,
        }
      : null
  const finalScore =
    isResolved && homeScore != null && awayScore != null
      ? { home: homeScore, away: awayScore }
      : null

  const winnerAnswerId = isResolved
    ? ordered.find((a) => a.id === c.resolution)?.id ??
      ordered.find((a) => a.resolution === 'YES')?.id ??
      null
    : null

  return {
    id: c.id,
    slug: c.slug,
    creatorUsername: c.creatorUsername,
    question: c.question,
    sport: sportForMarket({ sportsLeague: d.sportsLeague, groupIds }),
    league: d.sportsLeague ?? '',
    sportsEventId,
    startTime,
    kickoffKnown: kickoff != null,
    closeTime,
    status,
    isResolved,
    winnerAnswerId,
    resolutionTime: c.resolutionTime ?? null,
    home: toTeam(teams[0]),
    away: toTeam(teams[1]),
    draw: drawAnswer
      ? { answerId: drawAnswer.id, prob: drawAnswer.prob }
      : null,
    volume: c.volume ?? 0,
    uniqueBettorCount: c.uniqueBettorCount ?? 0,
    liveScore,
    finalScore,
    related: [] as RelatedRef[],
    relatedCount: 0,
  }
}

function toTeam(answer: Answer): ScheduleTeam {
  const { flag, name } = splitFlag(answer.text)
  const short = answer.shortText ? splitFlag(answer.shortText).name : ''
  return {
    answerId: answer.id,
    name,
    shortName: short || name,
    flag,
    imageUrl: answer.imageUrl ?? null,
    prob: answer.prob,
  }
}

async function getAnswers(
  pg: Pg,
  contractIds: string[]
): Promise<Record<string, Answer[]>> {
  if (contractIds.length === 0) return {}
  const rows = await pg.manyOrNone(
    `select * from answers where contract_id in ($1:list) order by index asc`,
    [contractIds]
  )
  return groupBy(rows.map(convertAnswer), 'contractId')
}

async function getGroupIds(
  pg: Pg,
  contractIds: string[]
): Promise<Record<string, string[]>> {
  if (contractIds.length === 0) return {}
  const rows = await pg.manyOrNone<{ contract_id: string; group_id: string }>(
    `select contract_id, group_id from group_contracts
     where contract_id in ($1:list)`,
    [contractIds]
  )
  const out: Record<string, string[]> = {}
  for (const r of rows) {
    ;(out[r.contract_id] ??= []).push(r.group_id)
  }
  return out
}

// ─── Markets in the sports topics ─────────────────────────────────────────────

// Open markets in the sports topics that could be props or side-bets on a game.
// Markets that closed at kickoff are kept for a while so live and just-finished
// games still show their "first to score"-style props.
async function getRelatedCandidates(
  pg: Pg,
  sport: SportKey | 'all'
): Promise<RelatedCandidate[]> {
  // A single-sport view still draws from the generic Sports topic, so a prop
  // tagged only "Sports" attaches to its game no matter which view is open.
  const groupIds =
    sport === 'all'
      ? ALL_SPORTS_GROUP_IDS
      : uniq([...sportGroupIds(sport), SPORTS_DEFAULT_GROUP_ID])
  return querySportsMarkets(pg, {
    groupIds,
    closeFrom: `-${FINISHED_GRACE_HOURS} hours`,
    closeTo: '45 days',
    orderBy: 'importance',
    limit: MAX_CANDIDATES,
  })
}

// Everything in any sports topic closing within the week, soonest first.
// Always fetched across all sports so the rail badges are complete whichever
// sport is open; the response is filtered down afterwards.
async function getUpcomingMarkets(pg: Pg): Promise<UpcomingMarketRef[]> {
  const rows = await querySportsMarkets(pg, {
    groupIds: ALL_SPORTS_GROUP_IDS,
    closeFrom: '0 seconds',
    closeTo: `${UPCOMING_DAYS} days`,
    orderBy: 'close',
    limit: MAX_UPCOMING,
  })
  return rows
    .filter(
      (r): r is RelatedCandidate & { closeTime: number } => r.closeTime != null
    )
    .map((r) => ({ id: r.id, closeTime: r.closeTime, sport: r.sport }))
}

async function querySportsMarkets(
  pg: Pg,
  opts: {
    groupIds: string[]
    /** Postgres interval strings relative to now(). */
    closeFrom: string
    closeTo: string
    orderBy: 'importance' | 'close'
    limit: number
  }
): Promise<RelatedCandidate[]> {
  const order =
    opts.orderBy === 'close' ? 'c.close_time asc' : 'c.importance_score desc'
  const rows = await pg.manyOrNone<{
    id: string
    question: string
    close_time: string | null
    importance_score: number
    sports_event_id: string | null
    sports_market_type: string | null
    group_ids: string[]
  }>(
    `select c.id, c.question, c.close_time, c.importance_score,
            c.data->>'sportsEventId' as sports_event_id,
            c.data->>'sportsMarketType' as sports_market_type,
            (select coalesce(array_agg(g.group_id), '{}')
               from group_contracts g
              where g.contract_id = c.id) as group_ids
     from contracts c
     where exists (
         select 1 from group_contracts gc
         where gc.contract_id = c.id and gc.group_id = any($1)
       )
       and c.token = 'MANA'
       and c.visibility = 'public'
       and coalesce(c.deleted, false) = false
       and c.resolution is null
       and c.outcome_type in (${MARKET_OUTCOME_TYPES})
       and c.close_time > now() + $2::interval
       and c.close_time < now() + $3::interval
     order by ${order}
     limit ${opts.limit}`,
    [opts.groupIds, opts.closeFrom, opts.closeTo]
  )
  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    questionLower: r.question.toLowerCase(),
    closeTime: r.close_time ? tsToMillis(r.close_time) : null,
    sportsEventId: r.sports_event_id,
    marketType: r.sports_market_type,
    sport: sportForMarket({ groupIds: r.group_ids }),
    importanceScore: Number(r.importance_score ?? 0),
  }))
}
