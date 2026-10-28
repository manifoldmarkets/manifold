import { groupBy, sortBy } from 'lodash'
import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect, log } from 'shared/utils'
import { getMarketLinksForFeed } from 'shared/supabase/market-links'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { Contract, isMultiCpmm, OutcomeType } from 'common/contract'
import { Answer } from 'common/answer'
import { tsToMillis } from 'common/supabase/utils'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { buildRaceWeekends, RaceContract } from 'common/race-weekends'
import { teamCodeForLeague } from 'common/sports-team-codes'
import {
  AnySportKey,
  buildSportsIndex,
  findRelatedMarkets,
  gameStatus,
  isDrawAnswer,
  parseSportsStart,
  RelatedCandidate,
  RelatedRef,
  relatedGroupForLink,
  ScheduleGame,
  ScheduleTeam,
  sportForMarket,
  SportsIndex,
  SportsScheduleResponse,
  SportsTopic,
  SportsTopicLink,
  SPORTS_DEFAULT_GROUP_ID,
  splitFlag,
  UpcomingMarketRef,
} from 'common/sports-schedule'
import { DAY_MS, HOUR_MS } from 'common/util/time'

// Game rows come from the automated pipelines only: markets created by the
// @ManifoldSports account that carry a sportsEventId. Everything else people
// make in the sports topics either hangs under a game as a related market or
// shows up in the "this week" list by close time. Finished games are loaded
// for a while after kickoff (their markets can still be matched) but never
// returned: the page is a feed of what's on and what's next.
const FINISHED_GRACE_HOURS = 18
const MAX_OFFICIAL_GAMES = 400
const MAX_CANDIDATES = 1000
const MAX_RELATED_PER_GAME = 25
const UPCOMING_DAYS = 7
const MAX_UPCOMING = 300
// The page loads these through markets-by-ids, which takes 100 ids at most.
const MAX_UPCOMING_RETURNED = 100

const MARKET_OUTCOME_TYPES: OutcomeType[] = [
  'BINARY',
  'MULTIPLE_CHOICE',
  'NUMBER',
  'MULTI_NUMERIC',
  'PSEUDO_NUMERIC',
]

type Pg = ReturnType<typeof createSupabaseDirectClient>

export const sportsSchedule: APIHandler<'sports-schedule'> = async (props) => {
  const sport: AnySportKey | 'all' = props.sport ?? 'all'
  const daysAhead = props.daysAhead ?? 14
  const limit = props.limit ?? 120
  const cursor = parseScheduleCursor(props.cursor)
  const pg = createSupabaseDirectClient()
  const now = Date.now()
  const horizon = now + daysAhead * DAY_MS

  const index = await getSportsIndex(pg, now)
  const [official, weekAll, allWeekends] = await Promise.all([
    getOfficialGames(pg, index, daysAhead, now),
    getUpcomingMarkets(pg, index),
    getRaceWeekends(pg, daysAhead, now),
  ])
  const games = official.filter((g) => g.startTime < horizon)
  // F1 weekends with something still to come inside the horizon.
  const weekends = allWeekends.filter(
    (w) =>
      w.status !== 'finished' &&
      w.sessions.some((s) => s.status !== 'finished' && s.startTime < horizon)
  )

  // Sort: live first (biggest games on top), then upcoming by kickoff, then
  // just-finished (most recent first). The id breaks ties so pages of
  // upcoming games follow one fixed order.
  const ordered = sortBy(
    games,
    (g) => (g.status === 'live' ? 0 : g.status === 'upcoming' ? 1 : 2),
    (g) =>
      g.status === 'live'
        ? -g.volume
        : g.status === 'finished'
        ? -g.startTime
        : g.startTime,
    (g) => g.id
  )

  // Match across all games before applying the selected sport or row limit,
  // so rail counts and the week feed don't change when the user switches tabs.
  const attached = new Set<string>()
  if (ordered.length > 0) {
    // Markets linked to a game go under it, where their creator put them.
    // A market linked to anything is left out of the team-name
    // matching, so it can't be guessed onto another game.
    const allCandidates = await getRelatedCandidates(pg, index)
    // Read both views in one snapshot; fall back completely if unavailable.
    const { linked, withParents } = await orWithoutLinks(
      () =>
        getMarketLinksForFeed(
          pg,
          ordered.map((g) => g.id),
          allCandidates.map((c) => c.id),
          {
            closeTimeFrom: now - FINISHED_GRACE_HOURS * HOUR_MS,
            closeTimeTo: now + 45 * DAY_MS,
            limitPerParent: MAX_RELATED_PER_GAME,
            outcomeTypes: MARKET_OUTCOME_TYPES,
          }
        ),
      { linked: [], withParents: new Set<string>() }
    )
    const candidates = allCandidates.filter((c) => !withParents.has(c.id))
    const linkedByGame = groupBy(linked, (l) => l.parentId)
    const candidateClose = new Map(candidates.map((c) => [c.id, c.closeTime]))
    const matchesByGame = ordered.map((g) =>
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
    ordered.forEach((g, i) => {
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
    ordered.forEach((g, i) => {
      const links = (linkedByGame[g.id] ?? []).map((l) => ({
        id: l.id,
        kind: 'linked' as const,
        group: relatedGroupForLink(l.relation),
      }))
      const officialMatches = matchesByGame[i].filter(
        (m) => m.kind === 'official'
      )
      const explicitIds = new Set(
        [...officialMatches, ...links].map((m) => m.id)
      )
      const matches = [
        ...officialMatches,
        ...links,
        ...matchesByGame[i].filter(
          (m) =>
            !explicitIds.has(m.id) && bestGameFor.get(m.id)?.gameId === g.id
        ),
      ].slice(0, MAX_RELATED_PER_GAME)
      if (props.includeRelated !== false) {
        g.related = matches.map(({ id, kind, group }) => ({ id, kind, group }))
      }
      g.relatedCount = matches.length
      for (const m of matches) attached.add(m.id)
    })
  }

  // "This week": everything in the sports topics closing within a week that
  // is not a game row and not already hanging under one. For a sports market
  // the close time is the game time, so this is the schedule of what people
  // made, with no matching involved.
  // F1 markets stay in: the page drops the ones on the cards it shows
  // (withoutRaceMarkets), so a weekend it doesn't feature is still listed.
  const gameIds = new Set(official.map((g) => g.id))
  const upcoming = weekAll.filter(
    (m) => !gameIds.has(m.id) && !attached.has(m.id)
  )

  // Rail badges: live and upcoming games per sport, the rows its feed shows.
  const counts: Partial<Record<AnySportKey, number>> = {}
  let liveCount = 0
  for (const g of ordered) {
    if (g.status === 'finished') continue
    counts[g.sport] = (counts[g.sport] ?? 0) + 1
    if (g.status === 'live') liveCount++
  }
  // An F1 session counts like a game: the rail shows how many are on.
  for (const w of weekends) {
    const on = w.sessions.filter((s) => s.status !== 'finished').length
    if (on > 0) counts[w.sport] = (counts[w.sport] ?? 0) + on
  }

  // The feed: every live game on the first page, then upcoming games by
  // kickoff, `limit` at a time. A cursor continues after the last game the
  // client has.
  const feed = ordered.filter(
    (g) => g.status !== 'finished' && (sport === 'all' || g.sport === sport)
  )
  const live = cursor ? [] : feed.filter((g) => g.status === 'live')
  const later = feed.filter(
    (g) => g.status === 'upcoming' && (!cursor || isAfterCursor(g, cursor))
  )
  const page = later.slice(0, limit)
  const last = page[page.length - 1]

  const response: SportsScheduleResponse = {
    snapshotTime: now,
    games: [...live, ...page],
    nextCursor:
      later.length > page.length && last ? scheduleCursor(last) : null,
    // Only the first page carries the week's other markets.
    upcoming: cursor
      ? []
      : (sport === 'all'
          ? upcoming
          : upcoming.filter((m) => m.sport === sport)
        ).slice(0, MAX_UPCOMING_RETURNED),
    raceWeekends: cursor || (sport !== 'all' && sport !== 'f1') ? [] : weekends,
    counts,
    liveCount,
    sports: index.sports,
  }
  return response
}

// A failed link read (say the market_links migration hasn't run yet) leaves
// the page on the team-name matching alone rather than taking it down.
async function orWithoutLinks<T>(read: () => Promise<T>, fallback: T) {
  try {
    return await read()
  } catch (e) {
    log.warn('[sports-schedule] market links unavailable', { e })
    return fallback
  }
}

// ─── Paging ───────────────────────────────────────────────────────────────────

// `<kickoff ms>_<contract id>` of the last upcoming game on the previous page.
const scheduleCursor = (g: Pick<ScheduleGame, 'startTime' | 'id'>) =>
  `${g.startTime}_${g.id}`

function parseScheduleCursor(cursor: string | undefined) {
  if (!cursor) return undefined
  const sep = cursor.indexOf('_')
  const startTime = Number(cursor.slice(0, sep))
  const id = cursor.slice(sep + 1)
  if (sep <= 0 || !Number.isFinite(startTime) || !id) return undefined
  return { startTime, id }
}

// Same order as the sort above: kickoff, then id.
function isAfterCursor(
  g: Pick<ScheduleGame, 'startTime' | 'id'>,
  cursor: { startTime: number; id: string }
) {
  return (
    g.startTime > cursor.startTime ||
    (g.startTime === cursor.startTime && g.id > cursor.id)
  )
}

// ─── Sports from the topic tree ───────────────────────────────────────────────

// Mods rearrange topics rarely, and every schedule request needs the tree.
const SPORTS_INDEX_TTL_MS = 5 * 60 * 1000
const MAX_TOPIC_DEPTH = 6
let sportsIndexCache: { at: number; index: SportsIndex } | undefined

async function getSportsIndex(pg: Pg, now: number): Promise<SportsIndex> {
  if (sportsIndexCache && now - sportsIndexCache.at < SPORTS_INDEX_TTL_MS)
    return sportsIndexCache.index
  try {
    const rows = await pg.manyOrNone<{
      parent_id: string
      child_id: string
      slug: string
      name: string
      total_members: number | null
    }>(
      `with recursive tree(parent_id, child_id, depth) as (
         select gg.top_id, gg.bottom_id, 1
         from group_groups gg
         join groups g on g.id = gg.bottom_id and g.privacy_status = 'public'
         where gg.top_id = $1
         union
         select gg.top_id, gg.bottom_id, t.depth + 1
         from tree t
         join group_groups gg on gg.top_id = t.child_id
         join groups g on g.id = gg.bottom_id and g.privacy_status = 'public'
         where t.depth < ${MAX_TOPIC_DEPTH}
       )
       select distinct t.parent_id, t.child_id, g.slug, g.name, g.total_members
       from tree t join groups g on g.id = t.child_id`,
      [SPORTS_DEFAULT_GROUP_ID]
    )
    const topics = new Map<string, SportsTopic>()
    const links: SportsTopicLink[] = []
    for (const r of rows) {
      links.push({ parentId: r.parent_id, childId: r.child_id })
      topics.set(r.child_id, {
        id: r.child_id,
        slug: r.slug,
        name: r.name,
        totalMembers: Number(r.total_members ?? 0),
      })
    }
    const index = buildSportsIndex([...topics.values()], links)
    sportsIndexCache = { at: now, index }
    return index
  } catch (e) {
    // The curated sports alone still make a working page.
    log.error('[sports-schedule] could not load the sports topics', {
      error: e instanceof Error ? e.message : String(e),
    })
    return sportsIndexCache?.index ?? buildSportsIndex([], [])
  }
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
  index: SportsIndex,
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
  // Rows come soonest first, so hitting the cap drops the latest games.
  if (rows.length === MAX_OFFICIAL_GAMES)
    log.warn(
      `[sports-schedule] ${MAX_OFFICIAL_GAMES} official games in the window; later games are cut off`
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
        index,
        now
      )
    )
    .filter((g): g is ScheduleGame => g !== null)
}

// F1 weekends: @ManifoldSports markets on a `bdl-f1:` session, which a game
// row can't show (common/race-weekends.ts). A weekend's earlier sessions stay
// on its card while later ones are still on, so this looks back four days.
const RACE_LOOKBACK_HOURS = 96
const MAX_RACE_MARKETS = 100

async function getRaceWeekends(pg: Pg, daysAhead: number, now: number) {
  const rows = await pg.manyOrNone(
    `select ${contractColumnsToSelect}
     from contracts
     where data->>'sportsEventId' like 'bdl-f1:%'
       and creator_id = any($2)
       and token = 'MANA'
       and visibility = 'public'
       and coalesce(deleted, false) = false
       and resolution is distinct from 'CANCEL'
       and close_time > now() - interval '${RACE_LOOKBACK_HOURS} hours'
       and close_time < now() + ($1 || ' days')::interval + interval '1 day'
     order by close_time asc
     limit ${MAX_RACE_MARKETS}`,
    [String(daysAhead), MANIFOLD_SPORTS_USER_IDS]
  )
  const contracts = rows.map((r) => convertContract(r) as RaceContract)
  const answers = await getAnswers(
    pg,
    contracts.map((c) => c.id)
  )
  return buildRaceWeekends(contracts, answers, now)
}

// A game market is multiple choice: home, away, and Draw for soccer. Binary
// game markets from an early build (dev only) don't get a row.
function toOfficialGame(
  c: Contract,
  answers: Answer[],
  groupIds: string[],
  index: SportsIndex,
  now: number
): ScheduleGame | null {
  const d = c as any
  const sportsEventId: string | undefined = d.sportsEventId
  if (!sportsEventId) return null
  const isResolved = !!c.resolution
  if (!isMultiCpmm(c)) return null

  const ordered = sortBy(answers, 'index')
  const drawAnswer = ordered.find((a) => isDrawAnswer(a.text))
  const teams = ordered.filter((a) => a !== drawAnswer)
  if (teams.length !== 2) return null
  const [homeAnswer, awayAnswer] = homeAndAway(
    teams,
    d.sportsHomeTeam,
    d.sportsAwayTeam
  )
  const home = toTeam(homeAnswer, d.sportsLeague)
  const away = toTeam(awayAnswer, d.sportsLeague)
  const draw = drawAnswer
    ? { answerId: drawAnswer.id, prob: drawAnswer.prob }
    : null
  const winnerAnswerId = isResolved
    ? ordered.find((a) => a.id === c.resolution)?.id ??
      ordered.find((a) => a.resolution === 'YES')?.id ??
      null
    : null

  const kickoff = parseSportsStart(d.sportsStartTimestamp)
  // Without a parseable kickoff the close time is the only deadline we have
  // (the row then says "Closes").
  const closeTime = c.closeTime ?? (kickoff ?? now) + 3 * HOUR_MS
  const startTime = kickoff ?? closeTime
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

  return {
    id: c.id,
    slug: c.slug,
    creatorUsername: c.creatorUsername,
    question: c.question,
    sport: sportForMarket({ sportsLeague: d.sportsLeague, groupIds }, index),
    league: d.sportsLeague ?? '',
    sportsEventId,
    startTime,
    kickoffKnown: kickoff != null,
    closeTime,
    status,
    isResolved,
    winnerAnswerId,
    resolutionTime: c.resolutionTime ?? null,
    home,
    away,
    draw,
    volume: c.volume ?? 0,
    uniqueBettorCount: c.uniqueBettorCount ?? 0,
    liveScore,
    liveUpdatedTime,
    scoreUpdatedTime: d.sportsScoreUpdatedTime ?? null,
    finalScore,
    related: [] as RelatedRef[],
    relatedCount: 0,
  }
}

/**
 * A game market's two team answers as [home, away]. Versus markets list away
 * first and soccer lists home first, so the stored team names decide; markets
 * without them (or whose answers were renamed) were created home first.
 */
export function homeAndAway(
  teams: Answer[],
  homeTeam: string | undefined,
  awayTeam: string | undefined
): [Answer, Answer] {
  const norm = (s: string) => splitFlag(s).name.trim().toLowerCase()
  const byName = (name: string | undefined) =>
    name ? teams.find((a) => norm(a.text) === norm(name)) : undefined
  const home = byName(homeTeam)
  const away = byName(awayTeam)
  if (home && home !== teams[0] && away !== home) return [teams[1], teams[0]]
  if (!home && away === teams[0]) return [teams[1], teams[0]]
  return [teams[0], teams[1]]
}

// Markets made before every league had team codes fall back to the code for
// the market's league.
function toTeam(answer: Answer, league: string | undefined): ScheduleTeam {
  const { flag, name } = splitFlag(answer.text)
  const short = answer.shortText
    ? splitFlag(answer.shortText).name
    : teamCodeForLeague(league, name)
  return {
    answerId: answer.id,
    name,
    shortName: short || name,
    flag,
    imageUrl: answer.imageUrl ?? null,
    color: answer.color ?? null,
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
  index: SportsIndex
): Promise<RelatedCandidate[]> {
  return querySportsMarkets(pg, index, {
    groupIds: index.allGroupIds,
    closeFrom: `-${FINISHED_GRACE_HOURS} hours`,
    closeTo: '45 days',
    orderBy: 'importance',
    limit: MAX_CANDIDATES,
  })
}

// Everything in any sports topic closing within the week, soonest first.
// Always fetched across all sports so the rail badges are complete whichever
// sport is open; the response is filtered down afterwards.
async function getUpcomingMarkets(
  pg: Pg,
  index: SportsIndex
): Promise<UpcomingMarketRef[]> {
  const rows = await querySportsMarkets(pg, index, {
    groupIds: index.allGroupIds,
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
  index: SportsIndex,
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
    sports_league: string | null
    creator_id: string
    group_ids: string[]
  }>(
    `select c.id, c.question, c.close_time, c.importance_score, c.creator_id,
            c.data->>'sportsEventId' as sports_event_id,
            c.data->>'sportsMarketType' as sports_market_type,
            c.data->>'sportsLeague' as sports_league,
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
       and c.outcome_type = any($4::text[])
       and c.close_time > now() + $2::interval
       and c.close_time < now() + $3::interval
     order by ${order}
     limit ${opts.limit}`,
    [opts.groupIds, opts.closeFrom, opts.closeTo, MARKET_OUTCOME_TYPES]
  )
  return rows.map((r) => {
    // API callers can set sports metadata. Only pipeline-owned markets may
    // consume the reserved official slots; others can still match by topic.
    const official = MANIFOLD_SPORTS_USER_IDS.includes(r.creator_id)
    return {
      id: r.id,
      question: r.question,
      questionLower: r.question.toLowerCase(),
      closeTime: r.close_time ? tsToMillis(r.close_time) : null,
      sportsEventId: official ? r.sports_event_id : null,
      marketType: official ? r.sports_market_type : null,
      // A pipeline's league first: its WNBA games sit in Basketball, which
      // is the NBA's. Other markets go by their topics.
      sport: sportForMarket(
        {
          sportsLeague: official ? r.sports_league : null,
          groupIds: r.group_ids,
        },
        index
      ),
      importanceScore: Number(r.importance_score ?? 0),
    }
  })
}
