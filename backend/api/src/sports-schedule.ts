import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { groupBy, sortBy, uniq, uniqBy } from 'lodash'
import { type APIHandler } from './helpers/endpoint'
import {
  createSupabaseDirectClient,
  READ_ONLY_REPEATABLE_MODE,
} from 'shared/supabase/init'
import { contractColumnsToSelect, log } from 'shared/utils'
import { getMarketLinksForFeed } from 'shared/supabase/market-links'
import { getSportsIndex } from 'shared/supabase/sports-index'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { OutcomeType } from 'common/contract'
import { Answer } from 'common/answer'
import { tsToMillis } from 'common/supabase/utils'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { F1_DAYS_AHEAD } from 'common/f1-markets'
import {
  buildRaceWeekends,
  findRaceRelatedMarkets,
  pickRaceChampionships,
  RaceContract,
  raceSessionId,
  RaceWeekend,
} from 'common/race-weekends'
import { isSportsContract } from 'common/contract'
import {
  availableGameLeagues,
  marketLeagueKey,
} from 'common/bdl/league-navigation'
import { scheduleFeedTime } from 'common/sports-game-feed'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import { toOfficialGame } from 'common/sports-official-game'
export { homeAndAway } from 'common/sports-official-game'
import {
  AnySportKey,
  findRelatedMarkets,
  RelatedCandidate,
  relatedGroupForLink,
  ScheduleGame,
  sportForMarket,
  SportsIndex,
  SportsScheduleResponse,
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
const OFFICIAL_PAGE_SIZE = 200
const MAX_CANDIDATES = 1000
const MAX_RELATED_PER_GAME = 25
const UPCOMING_DAYS = 7
const MAX_UPCOMING = 300
// The page loads these through markets-by-ids, which takes 100 ids at most.
const MAX_UPCOMING_RETURNED = 100
const MAX_CHAMPIONSHIP_CANDIDATES = 40

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
  // F1 looks further ahead than the games: two weeks of sessions would leave
  // its page bare.
  const raceDays = Math.max(daysAhead, F1_DAYS_AHEAD)
  const raceHorizon = now + raceDays * DAY_MS

  const index = await getSportsIndex(pg, now)
  // A topic's page has only the games and markets in it or a topic under it
  // (none for a topic the index doesn't have).
  const topicIds = props.topic
    ? new Set(index.topics.find((t) => t.id === props.topic)?.groupIds ?? [])
    : undefined
  const inTopic = (groupIds: readonly string[] | undefined) =>
    !!topicIds && (groupIds ?? []).some((id) => topicIds.has(id))
  const shows = (m: { sport: AnySportKey }, groupIds: readonly string[]) =>
    topicIds ? inTopic(groupIds) : sport === 'all' || m.sport === sport
  const [
    { games: official, groupIds: gameGroupIds },
    weekAll,
    { weekends: allWeekends, groupIds: raceGroupIds, verifiedSessions },
    { championships, verifiedTitle },
  ] = await Promise.all([
    isSportsBdlEnabled()
      ? getOfficialGames(pg, index, daysAhead, now)
      : getLegacyOfficialGames(pg, index, daysAhead, now),
    getUpcomingMarkets(pg, index),
    getRaceWeekends(pg, raceDays, now),
    sport === 'f1' && !cursor && !topicIds
      ? getRaceChampionships(pg, index, now)
      : Promise.resolve({ championships: [], verifiedTitle: false }),
  ])
  const games = official.filter((g) => {
    if (
      (g.gameState === 'suspended' || g.gameState === 'postponed') &&
      g.resumptionTime != null &&
      g.resumptionTime <= now
    )
      return false
    return scheduleFeedTime(g) < horizon
  })
  // F1 weekends with something still to come before `until`.
  const onBefore = (until: number) => (w: RaceWeekend) =>
    w.status !== 'finished' &&
    w.sessions.some((s) => s.status !== 'finished' && s.startTime < until)
  // The F1 page's weekends: what the rail counts and props are matched for,
  // whichever sport is open. /sports keeps to the games' horizon, so a
  // session weeks out doesn't trail after games still to load.
  const weekends = allWeekends.filter(onBefore(raceHorizon))

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
        : scheduleFeedTime(g),
    (g) => g.id
  )

  // Match across all games before applying the selected sport or row limit,
  // so rail counts and the week feed don't change when the user switches tabs.
  const attached = new Set<string>()
  // The games each attached market hangs under.
  const attachedTo = new Map<string, string[]>()
  // The weekends each market hangs under one of the sessions of: it leaves
  // the week list only where the page shows that weekend.
  const underWeekends = new Map<string, string[]>()
  if (ordered.length > 0 || weekends.length > 0) {
    // Markets linked to a game go under it, where their creator put them.
    // A market linked to anything is left out of the team-name
    // matching, so it can't be guessed onto another game.
    const allCandidates = await getRelatedCandidates(pg, index)
    // An F1 session's markets are parents too: a market linked to one goes
    // under its session.
    const sessionMarketIds = weekends.flatMap((w) =>
      w.sessions.flatMap((s) => s.markets.map((m) => m.id))
    )
    // Read both views in one snapshot; fall back completely if unavailable.
    const { linked, withParents } = await orWithoutLinks(
      () =>
        getMarketLinksForFeed(
          pg,
          [...ordered.map((g) => g.id), ...sessionMarketIds],
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
      for (const m of matches) {
        attached.add(m.id)
        attachedTo.set(m.id, [...(attachedTo.get(m.id) ?? []), g.id])
      }
    })

    // An F1 session: markets linked to one of its markets, then the ones
    // naming its Grand Prix that no game took (common/race-weekends.ts).
    const raceMatches = findRaceRelatedMarkets(
      weekends,
      candidates.filter((c) => !attached.has(c.id)),
      MAX_RELATED_PER_GAME
    )
    for (const w of weekends) {
      for (const s of w.sessions) {
        // A finished session isn't in the feed, so its markets (an open
        // prop closing later, say) stay in the week list (F4213-05).
        if (s.status === 'finished') continue
        const links = uniqBy(
          s.markets.flatMap((m) => linkedByGame[m.id] ?? []),
          (l) => l.id
        ).map((l) => ({
          id: l.id,
          kind: 'linked' as const,
          group: relatedGroupForLink(l.relation),
        }))
        const linkedIds = new Set(links.map((l) => l.id))
        const matches = [
          ...links,
          ...(raceMatches.get(raceSessionId(w, s)) ?? []).filter(
            (m) => !linkedIds.has(m.id) && !attached.has(m.id)
          ),
        ].slice(0, MAX_RELATED_PER_GAME)
        if (props.includeRelated !== false) {
          s.related = matches.map(({ id, kind, group }) => ({
            id,
            kind,
            group,
          }))
        }
        s.relatedCount = matches.length
        for (const m of matches)
          underWeekends.set(m.id, [...(underWeekends.get(m.id) ?? []), w.id])
      }
    }
  }

  // A weekend's topics: those of its sessions' markets.
  const weekendGroupIds = (w: RaceWeekend) =>
    w.sessions.flatMap((s) =>
      s.markets.flatMap((m) => raceGroupIds[m.id] ?? [])
    )
  // The weekends this page shows: all of F1's on /sports/f1; on /sports,
  // those within the games' horizon; on a topic's page, those with a market
  // in the topic.
  const shownWeekends = cursor
    ? []
    : topicIds
    ? weekends.filter((w) => inTopic(weekendGroupIds(w)))
    : sport !== 'all' && sport !== 'f1'
    ? []
    : sport === 'f1'
    ? weekends
    : weekends.filter(onBefore(horizon))
  const shownWeekendIds = new Set(shownWeekends.map((w) => w.id))
  // On a topic's page a market under a game leaves the week list only if the
  // page has that game; elsewhere, whatever game it's under.
  const topicGameIds = new Set(
    ordered.filter((g) => inTopic(gameGroupIds[g.id])).map((g) => g.id)
  )
  const underAGame = (id: string) =>
    topicIds
      ? (attachedTo.get(id) ?? []).some((g) => topicGameIds.has(g))
      : attached.has(id)

  // "This week": everything in the sports topics closing within a week that
  // is not a game row and not already hanging under one. For a sports market
  // the close time is the game time, so this is the schedule of what people
  // made, with no matching involved. A market under an F1 session leaves it
  // like a game's, where the page shows its weekend: /sports doesn't show one
  // three weeks out, so its markets stay listed there (F4213-11). The
  // official F1 markets stay in, and the page drops the ones on the sessions
  // it shows (withoutRaceMarkets).
  const gameIds = new Set(official.map((g) => g.id))
  const upcoming = weekAll.filter(
    (m) =>
      !gameIds.has(m.id) &&
      !underAGame(m.id) &&
      !(underWeekends.get(m.id) ?? []).some((id) => shownWeekendIds.has(id))
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
    (g) => g.status !== 'finished' && shows(g, gameGroupIds[g.id] ?? [])
  )
  const live = cursor ? [] : feed.filter((g) => g.status === 'live')
  const later = feed.filter(
    (g) => g.status === 'upcoming' && (!cursor || isAfterCursor(g, cursor))
  )
  const page = later.slice(0, limit)
  const last = page[page.length - 1]

  const response: SportsScheduleResponse = {
    snapshotTime: now,
    ...(isSportsBdlEnabled() &&
      !cursor && {
        availableLeagues: availableGameLeagues(
          feed,
          verifiedTitle ||
            shownWeekends.some((w) =>
              w.sessions.some(
                (session) =>
                  session.status !== 'finished' &&
                  session.startTime <
                    (sport === 'all' && !topicIds ? horizon : raceHorizon) &&
                  session.markets.some(
                    (m) =>
                      verifiedSessions.has(m.id) &&
                      (!topicIds || inTopic(raceGroupIds[m.id]))
                  )
              )
            )
        ),
      }),
    games: [...live, ...page],
    nextCursor:
      later.length > page.length && last ? scheduleCursor(last) : null,
    // Only the first page carries the week's other markets.
    upcoming: cursor
      ? []
      : upcoming
          .filter((m) => shows(m, m.groupIds))
          .slice(0, MAX_UPCOMING_RETURNED)
          .map(({ id, closeTime, sport }) => ({ id, closeTime, sport })),
    raceWeekends: shownWeekends,
    raceChampionships: championships,
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

// `<event ms>_<contract id>` of the last upcoming game on the previous page.
const scheduleCursor = (g: ScheduleGame) => `${scheduleFeedTime(g)}_${g.id}`

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
  g: ScheduleGame,
  cursor: { startTime: number; id: string }
) {
  return (
    scheduleFeedTime(g) > cursor.startTime ||
    (scheduleFeedTime(g) === cursor.startTime && g.id > cursor.id)
  )
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
async function getLegacyOfficialGames(
  pg: Pg,
  index: SportsIndex,
  daysAhead: number,
  now: number
): Promise<{
  games: ScheduleGame[]
  /** Each game's topic ids. */
  groupIds: Record<string, string[]>
}> {
  const maxGames = 400
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
     limit ${maxGames}`,
    [String(daysAhead), MANIFOLD_SPORTS_USER_IDS]
  )
  // Rows come soonest first, so hitting the cap drops the latest games.
  if (rows.length === maxGames)
    log.warn(
      `[sports-schedule] ${maxGames} official games in the window; later games are cut off`
    )
  const contracts = rows.map((r) => convertContract(r))
  const ids = contracts.map((c) => c.id)
  const [answersByContract, groupIdsByContract] = await Promise.all([
    getAnswers(pg, ids),
    getGroupIds(pg, ids),
  ])
  const games = contracts
    .map((c) =>
      toOfficialGame(
        c,
        answersByContract[c.id] ?? [],
        groupIdsByContract[c.id] ?? [],
        index,
        now,
        false
      )
    )
    .filter((g): g is ScheduleGame => g !== null)
  return { games, groupIds: groupIdsByContract }
}

async function getOfficialGames(
  pg: Pg,
  index: SportsIndex,
  daysAhead: number,
  now: number
) {
  // Rescheduling, deleting or privatizing a contract during this request must
  // not move it between pages or mix its answers with a different snapshot.
  return pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, async (tx) => {
    const games: ScheduleGame[] = []
    const groupIds: Record<string, string[]> = {}
    const earliestClose = new Date(now - FINISHED_GRACE_HOURS * HOUR_MS)
    const horizon = now + daysAhead * DAY_MS
    // The two scans are disjoint. The second handles games that were postponed
    // beyond their original close and now have a confirmed resumption in view.
    for (const resuming of [false, true]) {
      const key = resuming ? "(data->'sportsResumptionTime')" : 'close_time'
      const cast = resuming ? 'jsonb' : 'timestamptz'
      const lower = resuming ? String(now) : earliestClose
      const upper = resuming ? String(horizon) : new Date(horizon + DAY_MS)
      type Row = Parameters<typeof convertContract>[0] & {
        id: string
        page_time: string
      }
      let after: Row | undefined
      for (;;) {
        const boundary = after
          ? `(${key}, id) > ($1::${cast}, $3::text)`
          : `${key} > $1::${cast}`
        const rows: Row[] = await tx.manyOrNone<Row>(
          `select ${contractColumnsToSelect}, id, ${key}::text as page_time
           from contracts
           where data->>'sportsEventId' is not null
             and creator_id = any($4)
             and token = 'MANA'
             and visibility = 'public'
             and coalesce(deleted, false) = false
             and resolution is distinct from 'CANCEL'
             and ${boundary} and ${key} < $2::${cast}
             ${
               resuming
                 ? `and close_time <= $5 and resolution is null
                and jsonb_typeof(data->'sportsResumptionTime') = 'number'
                and upper(data->>'sportsLiveStatus') in ('SUSPENDED','POSTPONED')`
                 : ''
             }
           order by ${key}, id
           limit ${OFFICIAL_PAGE_SIZE}`,
          [
            after?.page_time ?? lower,
            upper,
            after?.id,
            MANIFOLD_SPORTS_USER_IDS,
            earliestClose,
          ]
        )
        const ids = rows.map((r) => r.id)
        const answers = await getAnswers(tx, ids)
        const groups = await getGroupIds(tx, ids)
        for (const row of rows) {
          const contract = convertContract(row)
          const topics = groups[contract.id] ?? []
          const game = toOfficialGame(
            contract,
            answers[contract.id] ?? [],
            topics,
            index,
            now
          )
          if (
            !game ||
            (resuming &&
              (!game.sportsLeagueKey ||
                BDL_LEAGUES[game.sportsLeagueKey].adapter !== 'us-majors' ||
                !game.resumptionTime))
          )
            continue
          games.push(game)
          groupIds[game.id] = topics
        }
        if (rows.length < OFFICIAL_PAGE_SIZE) break
        // Keep the exact database key (including submillisecond precision).
        after = rows[rows.length - 1]
      }
    }
    return { games, groupIds }
  })
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
  const full = rows.map((r) => convertContract(r))
  const contracts = full.map((c) => c as RaceContract)
  const ids = contracts.map((c) => c.id)
  const [answers, groupIds] = await Promise.all([
    getAnswers(pg, ids),
    getGroupIds(pg, ids),
  ])
  const slugs = new Map(full.map((c) => [c.id, c.groupSlugs ?? []]))
  const weekends = buildRaceWeekends(contracts, answers, now).map((w) => ({
    ...w,
    groupSlugs: uniq(
      w.sessions.flatMap((s) => s.markets.flatMap((m) => slugs.get(m.id) ?? []))
    ),
  }))
  const verifiedSessions = new Set(
    isSportsBdlEnabled()
      ? full
          .filter(
            (c) =>
              isSportsContract(c) &&
              !c.resolution &&
              !c.isResolved &&
              marketLeagueKey(c) === 'f1'
          )
          .map((c) => c.id)
      : []
  )
  return { weekends, groupIds, verifiedSessions }
}

// The F1 page's title markets: our own (a `bdl-f1-title:` market from
// @ManifoldSports) first, then open multiple choice markets in the sports
// topics about F1 and a championship. Which ones count, and the pick of
// each kind, is pickRaceChampionships. The order by repeats the test for
// ours: Postgres can't read an output column's name inside an expression.
async function getRaceChampionships(pg: Pg, index: SportsIndex, now: number) {
  const rows = await pg.manyOrNone<{
    id: string
    question: string
    bettors: number | null
    volume: number | null
    official_event_id: string | null
    navigation?: Parameters<typeof marketLeagueKey>[0]
  }>(
    `select c.question, c.id,
            (c.data->>'uniqueBettorCount')::float8 as bettors,
            (c.data->>'volume')::float8 as volume,
            case when c.creator_id = any($4)
                  and c.data->>'sportsEventId' like 'bdl-f1-title:%'
                 then c.data->>'sportsEventId' end as official_event_id${
                   isSportsBdlEnabled()
                     ? `,
              jsonb_build_object('sportsProvider',c.data->'sportsProvider',
                                 'sportsFixture',c.data->'sportsFixture',
                                 'sportsLeagueKey',c.data->'sportsLeagueKey',
                                 'sportsLeague',c.data->'sportsLeague') as navigation`
                     : ''
                 }
     from contracts c
     where exists (
         select 1 from group_contracts gc
         where gc.contract_id = c.id and gc.group_id = any($1)
       )
       and c.token = 'MANA'
       and c.visibility = 'public'
       and coalesce(c.deleted, false) = false
       and c.resolution is null
       and c.close_time > now()
       and c.outcome_type = 'MULTIPLE_CHOICE'
       and c.question ~* $2
       and c.question ~* $3
     order by (c.creator_id = any($4)
               and c.data->>'sportsEventId' like 'bdl-f1-title:%') is true desc,
              bettors desc nulls last
     limit ${MAX_CHAMPIONSHIP_CANDIDATES}`,
    [
      index.allGroupIds,
      '(champion|\\mwdc\\M|\\mwcc\\M)',
      '(formula (1|one)|\\mf1\\M)',
      MANIFOLD_SPORTS_USER_IDS,
    ]
  )
  const championships = pickRaceChampionships(
    rows.map((r) => ({
      id: r.id,
      question: r.question,
      uniqueBettorCount: Number(r.bettors ?? 0),
      volume: Number(r.volume ?? 0),
      officialEventId: r.official_event_id,
    })),
    now
  )
  // Question-only community titles remain valid for the historical sidebar.
  // Only a chosen, verified official title can establish league availability.
  const verifiedTitle =
    isSportsBdlEnabled() &&
    rows.some(
      (r) =>
        championships.some((c) => c.id === r.id) &&
        marketLeagueKey({
          ...r.navigation,
          sportsEventId: r.official_event_id,
        }) === 'f1'
    )
  return { championships, verifiedTitle }
}

async function getAnswers(
  pg: Pick<Pg, 'manyOrNone'>,
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
  pg: Pick<Pg, 'manyOrNone'>,
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
): Promise<(UpcomingMarketRef & { groupIds: string[] })[]> {
  const rows = await querySportsMarkets(pg, index, {
    groupIds: index.allGroupIds,
    closeFrom: '0 seconds',
    closeTo: `${UPCOMING_DAYS} days`,
    orderBy: 'close',
    limit: MAX_UPCOMING,
  })
  return rows
    .filter((r): r is typeof r & { closeTime: number } => r.closeTime != null)
    .map((r) => ({
      id: r.id,
      closeTime: r.closeTime,
      sport: r.sport,
      groupIds: r.groupIds,
    }))
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
): Promise<(RelatedCandidate & { groupIds: string[] })[]> {
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
      groupIds: r.group_ids,
    }
  })
}
