import { groupBy, sortBy } from 'lodash'
import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect, log } from 'shared/utils'
import {
  getIdsWithParents,
  getLinkedChildren,
} from 'shared/supabase/market-links'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { Contract, isMultiCpmm } from 'common/contract'
import { Answer } from 'common/answer'
import { tsToMillis } from 'common/supabase/utils'
import { MANIFOLD_SPORTS_USER_IDS, teamBadge } from 'common/sports'
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

const MARKET_OUTCOME_TYPES =
  "'BINARY', 'MULTIPLE_CHOICE', 'NUMBER', 'MULTI_NUMERIC', 'PSEUDO_NUMERIC'"

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
  const [official, weekAll] = await Promise.all([
    getOfficialGames(pg, index, daysAhead, now),
    getUpcomingMarkets(pg, index),
  ])
  const games = official.filter((g) => g.startTime < horizon)

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
    // Markets linked to a game go under it first, where their creator put
    // them. A market linked to anything is left out of the team-name
    // matching, so it can't be guessed onto another game.
    const [allCandidates, linked] = await Promise.all([
      getRelatedCandidates(pg, index),
      orWithoutLinks(
        () =>
          getLinkedChildren(
            pg,
            ordered.map((g) => g.id)
          ),
        []
      ),
    ])
    const withParents = await orWithoutLinks(
      () =>
        getIdsWithParents(
          pg,
          allCandidates.map((c) => c.id)
        ),
      new Set<string>()
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
      const linkedIds = new Set(links.map((l) => l.id))
      const matches = [
        ...links,
        ...matchesByGame[i].filter(
          (m) =>
            !linkedIds.has(m.id) &&
            (m.kind === 'official' || bestGameFor.get(m.id)?.gameId === g.id)
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
export const scheduleCursor = (g: Pick<ScheduleGame, 'startTime' | 'id'>) =>
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

// A game market is either multiple choice with an answer per side (soccer,
// with Draw) or binary with the teams named in sportsHomeTeam/sportsAwayTeam
// (YES is the home team). Both become the same row.
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
  const binary = c.mechanism === 'cpmm-1'

  let home: ScheduleTeam
  let away: ScheduleTeam
  let draw: { answerId: string; prob: number } | null = null
  let winnerAnswerId: string | null = null
  if (binary) {
    const homeName: string | undefined = d.sportsHomeTeam
    const awayName: string | undefined = d.sportsAwayTeam
    if (!homeName || !awayName) return null
    const prob: number = d.prob ?? 0.5
    home = binaryTeam('YES', homeName, prob, d.sportsLeague)
    away = binaryTeam('NO', awayName, 1 - prob, d.sportsLeague)
    // A tie resolves at 50% (MKT), which leaves no winner to mark.
    winnerAnswerId =
      c.resolution === 'YES' ? 'YES' : c.resolution === 'NO' ? 'NO' : null
  } else if (isMultiCpmm(c)) {
    const ordered = sortBy(answers, 'index')
    const drawAnswer = ordered.find((a) => isDrawAnswer(a.text))
    const teams = ordered.filter((a) => a !== drawAnswer)
    if (teams.length !== 2) return null
    home = toTeam(teams[0])
    away = toTeam(teams[1])
    draw = drawAnswer
      ? { answerId: drawAnswer.id, prob: drawAnswer.prob }
      : null
    winnerAnswerId = isResolved
      ? ordered.find((a) => a.id === c.resolution)?.id ??
        ordered.find((a) => a.resolution === 'YES')?.id ??
        null
      : null
  } else {
    return null
  }

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
    binary,
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
    finalScore,
    related: [] as RelatedRef[],
    relatedCount: 0,
  }
}

function binaryTeam(
  side: 'YES' | 'NO',
  name: string,
  prob: number,
  league: string | undefined
): ScheduleTeam {
  const { flag, name: plain } = splitFlag(name)
  const short = teamBadge(plain, league)
  return {
    answerId: side,
    name: plain,
    shortName: short || plain,
    flag,
    imageUrl: null,
    color: null,
    prob,
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
    sport: sportForMarket({ groupIds: r.group_ids }, index),
    importanceScore: Number(r.importance_score ?? 0),
  }))
}
