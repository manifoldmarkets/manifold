import { groupBy } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { loadSportsIndex } from 'shared/supabase/sports-index'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  leaderboardBoardsForMarket,
  SPORTS_LEADERBOARD_SIZE,
  SportsLeaderboardEntry,
  SportsLeaderboardKind,
  SportsLeaderboardPosition,
  SportsLeaderboards,
  topicBoardsByGroupId,
} from 'common/sports-leaderboards'

// The boards cover every MANA market in a topic under Sports, ranked markets
// only, like the topic leaderboards. Each market counts toward All, its
// sport, and each other topic under Sports whose page covers it.

// Ranks everyone in `scores` (board, user_id, score) on each board, best
// first, leaving out banned users and the accounts in $3, and writes them to
// sports_leaderboard_positions as kind $4. `m` has a row per market and board
// it counts toward. Returns how many it wrote. A score that isn't a number
// (a NaN position) leaves its user off that board.
const writePositions = (scores: string) => `
  with m as (
    select * from unnest($1::text[], $2::text[]) as m(contract_id, board)
  ),
  scores as (${scores}),
  ranked as (
    select s.board, s.user_id, s.score,
      row_number() over (
        partition by s.board order by s.score desc, s.user_id
      ) as rank
    from scores s
    join users u on u.id = s.user_id
    where s.score is not null
      and s.score <> 'NaN'::numeric
      and s.user_id <> all($3::text[])
      and coalesce((u.data->>'isBannedFromPosting')::boolean, false) is not true
  ),
  written as (
    insert into sports_leaderboard_positions (board, kind, user_id, rank, score)
    select board, $4, user_id, rank, score from ranked
    returning 1
  )
  select count(*)::int as n from written`

// Each market's positions are read once, then added to each of its boards.
const PROFIT_SCORES = `
  select m.board, p.user_id, sum(p.profit) as score
  from (
    select ucm.contract_id, ucm.user_id, ucm.profit
    from user_contract_metrics ucm
    where ucm.contract_id in (select contract_id from m)
      and ucm.answer_id is null
  ) p
  join m on m.contract_id = p.contract_id
  group by m.board, p.user_id`

const CREATOR_SCORES = `
  select
    m.board,
    c.creator_id as user_id,
    sum(coalesce((c.data->>'uniqueBettorCount')::numeric, 0)) as score
  from m
  join contracts c on c.id = m.contract_id
  group by m.board, c.creator_id`

// Thrown inside the rebuild's transaction to roll it back.
class NothingToRank extends Error {}

/**
 * Rebuilds every board and everyone's place on it. Returns how many boards it
 * stored. Throws, leaving the stored boards as they are, if it can't read the
 * topic tree.
 */
export async function rebuildSportsLeaderboards(
  pg: SupabaseDirectClient,
  now = Date.now()
): Promise<number> {
  // Fail before the expensive reads if the API's migrations haven't run.
  const tables = await pg.one<{ boards: string | null; places: string | null }>(
    `select to_regclass('public.sports_leaderboards')::text as boards,
       to_regclass('public.sports_leaderboard_positions')::text as places`
  )
  if (!tables.boards)
    throw new Error(
      'sports_leaderboards does not exist; run migration 2026102901 first'
    )
  if (!tables.places)
    throw new Error(
      'sports_leaderboard_positions does not exist; run migration 2026102902 first'
    )
  // Not the cached getSportsIndex: its fallback when the tree can't be read
  // (the curated sports alone) would replace whole boards with partial ones.
  const index = await loadSportsIndex(pg)
  const markets = await pg.manyOrNone<{
    id: string
    sports_league: string | null
    outcome_type: string
    group_ids: string[]
  }>(
    `select c.id, c.data->>'sportsLeague' as sports_league, c.outcome_type,
       array_agg(gc.group_id) as group_ids
     from group_contracts gc
     join contracts c on c.id = gc.contract_id
     where gc.group_id = any($1)
       and c.token = 'MANA'
       and coalesce((c.data->'isRanked')::boolean, true)
     group by c.id`,
    [index.allGroupIds]
  )

  // A row per market and board it counts toward.
  const byGroupId = topicBoardsByGroupId(index)
  const profit = { ids: [] as string[], boards: [] as string[] }
  const creator = { ids: [] as string[], boards: [] as string[] }
  for (const m of markets) {
    const boards = leaderboardBoardsForMarket(
      { sportsLeague: m.sports_league, groupIds: m.group_ids },
      index,
      byGroupId
    )
    // Like the topic leaderboards: polls and bounties don't count for creators.
    const forCreators = m.outcome_type !== 'POLL' && m.outcome_type !== 'BOUNTY'
    for (const board of boards) {
      profit.ids.push(m.id)
      profit.boards.push(board)
      if (forCreators) {
        creator.ids.push(m.id)
        creator.boards.push(board)
      }
    }
  }

  // Everything is replaced in one transaction, so a sport or topic that drops
  // out loses its rows, and readers see the old boards until it commits. The
  // ranking runs inside it: everyone's place is written straight from the
  // query, and the top of each board is read back from those places.
  type Row = {
    board: string
    kind: SportsLeaderboardKind
    user_id: string
    score: string
  }
  try {
    return await pg.tx(async (tx) => {
      await tx.none(`delete from sports_leaderboard_positions`)
      // One after the other: each reads every sports market's positions.
      await tx.one(writePositions(PROFIT_SCORES), [
        profit.ids,
        profit.boards,
        HIDE_FROM_LEADERBOARD_USER_IDS,
        'profit',
      ])
      // The sports bot creates the game markets; the creator board is for
      // people.
      await tx.one(writePositions(CREATOR_SCORES), [
        creator.ids,
        creator.boards,
        [...HIDE_FROM_LEADERBOARD_USER_IDS, ...MANIFOLD_SPORTS_USER_IDS],
        'creator',
      ])
      // The boards list positive scores only, best first.
      const top = await tx.manyOrNone<Row>(
        `select board, kind, user_id, score from sports_leaderboard_positions
         where rank <= $1 and score > 0
         order by board, kind, rank`,
        [SPORTS_LEADERBOARD_SIZE]
      )
      // Nothing to rank means a read went wrong; keep what there is.
      if (top.length === 0) throw new NothingToRank()
      // The table keeps a board's key in its `sport` column.
      const rows = Object.values(
        groupBy(top, (r) => `${r.board}|${r.kind}`)
      ).map((board) => ({
        sport: board[0].board,
        kind: board[0].kind,
        entries: board.map(
          (r): SportsLeaderboardEntry => ({
            userId: r.user_id,
            score: Number(r.score),
          })
        ),
      }))
      await tx.none(`delete from sports_leaderboards`)
      await tx.none(
        `insert into sports_leaderboards (sport, kind, entries, updated_time)
         select r.sport, r.kind, r.entries, $2
         from jsonb_to_recordset($1::jsonb) as r(sport text, kind text, entries jsonb)`,
        [JSON.stringify(rows), new Date(now)]
      )
      return rows.length
    })
  } catch (e) {
    if (e instanceof NothingToRank) return 0
    throw e
  }
}

const UNDEFINED_TABLE = '42P01'

/**
 * A board's stored entries: a sport's key ('all' for every sport), or a
 * topic's (topicBoardKey).
 */
export async function getSportsLeaderboards(
  pg: SupabaseDirectClient,
  board: string,
  /** Also say where this user stands on each kind. */
  userId?: string
): Promise<SportsLeaderboards> {
  const result: SportsLeaderboards = {
    profit: [],
    creator: [],
    updatedTime: null,
  }
  // The left join keeps the rebuild time for a board with no entries.
  const rows = await pg
    .manyOrNone<{
      built: Date | null
      kind: SportsLeaderboardKind | null
      entries: SportsLeaderboardEntry[] | null
    }>(
      `select b.built, l.kind, l.entries
       from (select max(updated_time) as built from sports_leaderboards) b
       left join sports_leaderboards l on l.sport = $1`,
      [board]
    )
    .catch((e) => {
      // Before the migration has run: nothing built yet.
      if ((e as { code?: string }).code === UNDEFINED_TABLE) return []
      throw e
    })
  if (rows[0]?.built) result.updatedTime = new Date(rows[0].built).getTime()
  for (const r of rows) {
    if (r.kind === 'profit' || r.kind === 'creator')
      result[r.kind] = r.entries ?? []
  }
  if (userId) result.you = await getPositions(pg, board, userId)
  return result
}

// A user's place on a board's kinds, with how many are ranked on each.
async function getPositions(
  pg: SupabaseDirectClient,
  board: string,
  userId: string
): Promise<Record<SportsLeaderboardKind, SportsLeaderboardPosition | null>> {
  const you: Record<SportsLeaderboardKind, SportsLeaderboardPosition | null> = {
    profit: null,
    creator: null,
  }
  const rows = await pg
    .manyOrNone<{
      kind: SportsLeaderboardKind
      rank: number
      score: string
      of: number
    }>(
      `select p.kind, p.rank, p.score,
         (select count(*) from sports_leaderboard_positions c
          where c.board = p.board and c.kind = p.kind)::int as of
       from sports_leaderboard_positions p
       where p.board = $1 and p.user_id = $2`,
      [board, userId]
    )
    .catch((e) => {
      // Before the migration has run: nobody has a place yet.
      if ((e as { code?: string }).code === UNDEFINED_TABLE) return []
      throw e
    })
  for (const r of rows) {
    const score = Number(r.score)
    if ((r.kind === 'profit' || r.kind === 'creator') && Number.isFinite(score))
      you[r.kind] = { rank: r.rank, score, of: r.of }
  }
  return you
}
