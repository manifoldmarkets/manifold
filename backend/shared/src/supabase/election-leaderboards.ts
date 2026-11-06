import { difference, orderBy } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import {
  ELECTION_LEADERBOARD_KINDS,
  ELECTION_LEADERBOARD_SERVED,
  ELECTION_LEADERBOARD_STORED,
  ELECTION_LEADERBOARDS,
  ElectionLeaderboard,
  ElectionLeaderboardConfig,
  ElectionLeaderboardEntry,
  ElectionLeaderboardKey,
  ElectionLeaderboards,
} from 'common/election-leaderboards'

// The /election page's leaderboards: profit and creators over the ranked
// MANA markets in any of a board's topics, each market counted once, like the
// topic leaderboards (backend/api/src/get-leaderboard.ts).

const HOUR_MS = 60 * 60 * 1000
// An hourly job fires a few seconds either side of when the last run wrote,
// so a board is due a little before its refreshHours are up.
export const REFRESH_SLACK_MS = 5 * 60 * 1000

export type StoredBoardTime = {
  board: string
  kind: string
  updatedTime: number
}

/**
 * The boards to rebuild at `now`, in `boards` order: those missing either
 * kind, or whose older kind is at least refreshHours (less the slack) old.
 */
export function dueElectionBoards(
  stored: StoredBoardTime[],
  now: number,
  boards: ElectionLeaderboardConfig[] = ELECTION_LEADERBOARDS
): ElectionLeaderboardConfig[] {
  return boards.filter((b) => {
    let oldest = Infinity
    for (const kind of ELECTION_LEADERBOARD_KINDS) {
      const row = stored.find((s) => s.board === b.key && s.kind === kind)
      if (!row || !Number.isFinite(row.updatedTime)) return true
      oldest = Math.min(oldest, row.updatedTime)
    }
    return now - oldest >= b.refreshHours * HOUR_MS - REFRESH_SLACK_MS
  })
}

/**
 * Entries with a finite score, best first (user id breaks ties), at most
 * `size` of them. Scores may come from postgres as numeric strings.
 */
export function rankEntries(
  rows: { userId: string; score: string | number | null }[],
  size: number
): ElectionLeaderboardEntry[] {
  const entries: ElectionLeaderboardEntry[] = []
  for (const r of rows) {
    if (r.score === null || r.score === '') continue
    const score = Number(r.score)
    if (Number.isFinite(score)) entries.push({ userId: r.userId, score })
  }
  return orderBy(entries, ['score', 'userId'], ['desc', 'asc']).slice(0, size)
}

/** A stored entries column, keeping only well-formed entries. */
export function parseStoredEntries(
  value: unknown,
  size: number
): ElectionLeaderboardEntry[] {
  if (!Array.isArray(value)) return []
  const rows: { userId: string; score: number }[] = []
  for (const e of value as unknown[]) {
    if (typeof e !== 'object' || e === null) continue
    const { userId, score } = e as { userId?: unknown; score?: unknown }
    if (typeof userId === 'string' && typeof score === 'number')
      rows.push({ userId, score })
  }
  return rankEntries(rows, size)
}

export type StoredBoardRow = {
  board: string
  kind: string
  entries: unknown
  updated_time: Date | string
}

/**
 * The stored rows as the API serves them: boards in ELECTION_LEADERBOARDS
 * order, each with up to ELECTION_LEADERBOARD_SERVED entries per kind. A
 * board missing either kind is left out.
 */
export function assembleElectionLeaderboards(
  rows: StoredBoardRow[]
): ElectionLeaderboards {
  const boards: ElectionLeaderboard[] = []
  for (const config of ELECTION_LEADERBOARDS) {
    const profit = rows.find(
      (r) => r.board === config.key && r.kind === 'profit'
    )
    const creator = rows.find(
      (r) => r.board === config.key && r.kind === 'creator'
    )
    if (!profit || !creator) continue
    // The rebuild writes both kinds at once; the older time is the honest one.
    const updatedTime = Math.min(
      new Date(profit.updated_time).getTime(),
      new Date(creator.updated_time).getTime()
    )
    if (!Number.isFinite(updatedTime)) continue
    boards.push({
      key: config.key,
      label: config.label,
      updatedTime,
      profit: parseStoredEntries(profit.entries, ELECTION_LEADERBOARD_SERVED),
      creator: parseStoredEntries(creator.entries, ELECTION_LEADERBOARD_SERVED),
    })
  }
  return { boards }
}

// The ranked MANA markets in any of the topics $1. `in` counts a market once
// however many of the topics hold it.
const MARKETS = `
  select c.id, c.creator_id, c.outcome_type,
    c.data->>'uniqueBettorCount' as traders
  from contracts c
  where c.id in (
      select gc.contract_id from group_contracts gc
      where gc.group_id = any($1::text[])
    )
    and c.token = 'MANA'
    and coalesce((c.data->'isRanked')::boolean, true)`

// A score JavaScript can't hold as a finite number (NaN, infinite, or past
// 1e300) leaves its user off the board; numeric NaN compares above every
// number, so the bound catches it.

// Profit per user summed over the markets' positions. Leaves out the
// accounts in $2 and banned users; returns the best $3.
const PROFIT_SQL = `
  with m as (${MARKETS}),
  scores as (
    select ucm.user_id, sum(ucm.profit) as score
    from user_contract_metrics ucm
    where ucm.contract_id in (select id from m)
      and ucm.answer_id is null
    group by ucm.user_id
  )
  select s.user_id, s.score
  from scores s
  join users u on u.id = s.user_id
  where abs(s.score) < 1e300
    and s.user_id <> all($2::text[])
    and coalesce((u.data->>'isBannedFromPosting')::boolean, false) is not true
  order by s.score desc, s.user_id
  limit $3`

// Traders per creator summed over the markets, polls and bounties aside
// (like the topic leaderboards). Leaves out banned creators; returns the
// best $2.
const CREATOR_SQL = `
  with m as (${MARKETS}),
  scores as (
    select m.creator_id as user_id,
      sum(coalesce(m.traders::numeric, 0)) as score
    from m
    where m.outcome_type not in ('POLL', 'BOUNTY')
    group by m.creator_id
  )
  select s.user_id, s.score
  from scores s
  join users u on u.id = s.user_id
  where abs(s.score) < 1e300
    and coalesce((u.data->>'isBannedFromPosting')::boolean, false) is not true
  order by s.score desc, s.user_id
  limit $2`

// Both kinds in one statement, so a board's rows always come from one build.
const UPSERT_SQL = `
  insert into election_leaderboards (board, kind, entries, updated_time)
  values ($1, 'profit', $2::jsonb, $4), ($1, 'creator', $3::jsonb, $4)
  on conflict (board, kind) do update
    set entries = excluded.entries, updated_time = excluded.updated_time`

type ScoreRow = { user_id: string; score: string | number | null }

const toEntries = (rows: ScoreRow[]) =>
  rankEntries(
    rows.map((r) => ({ userId: r.user_id, score: r.score })),
    ELECTION_LEADERBOARD_STORED
  )

async function rebuildBoard(
  pg: SupabaseDirectClient,
  board: ElectionLeaderboardConfig,
  now: number
) {
  const groups = await pg.manyOrNone<{ id: string; slug: string }>(
    `select id, slug from groups where slug = any($1::text[])`,
    [board.topicSlugs]
  )
  // No topics means a read or the config went wrong; keep the stored board.
  if (groups.length === 0)
    throw new Error(`none of its ${board.topicSlugs.length} topics exist`)
  const missing = difference(
    board.topicSlugs,
    groups.map((g) => g.slug)
  )
  if (missing.length > 0)
    log.warn(`[election-leaderboards] ${board.key}: topics not found`, {
      missing,
    })
  const groupIds = groups.map((g) => g.id)
  // One after the other: each reads every market in the board's topics.
  const profit = await pg.manyOrNone<ScoreRow>(PROFIT_SQL, [
    groupIds,
    HIDE_FROM_LEADERBOARD_USER_IDS,
    ELECTION_LEADERBOARD_STORED,
  ])
  const creator = await pg.manyOrNone<ScoreRow>(CREATOR_SQL, [
    groupIds,
    ELECTION_LEADERBOARD_STORED,
  ])
  await pg.none(UPSERT_SQL, [
    board.key,
    JSON.stringify(toEntries(profit)),
    JSON.stringify(toEntries(creator)),
    new Date(now),
  ])
}

export type ElectionLeaderboardsRebuild = {
  rebuilt: ElectionLeaderboardKey[]
  skipped: ElectionLeaderboardKey[]
  failed: ElectionLeaderboardKey[]
}

const tableExists = async (pg: SupabaseDirectClient) => {
  const { t } = await pg.one<{ t: string | null }>(
    `select to_regclass('public.election_leaderboards')::text as t`
  )
  return t !== null
}

/**
 * Rebuilds each board that's due (dueElectionBoards), one at a time. A board
 * that fails keeps its stored rows, is retried next run, and doesn't stop the
 * others. Every board's rows are stamped `now`, so the next hourly run finds
 * them due on time however long this one took.
 */
export async function rebuildElectionLeaderboards(
  pg: SupabaseDirectClient,
  now = Date.now()
): Promise<ElectionLeaderboardsRebuild> {
  // Fail before the expensive reads if the API's migrations haven't run.
  if (!(await tableExists(pg)))
    throw new Error(
      'election_leaderboards does not exist; run migration 2026110601 first'
    )
  const stored = await pg.manyOrNone<{
    board: string
    kind: string
    updated_time: Date
  }>(`select board, kind, updated_time from election_leaderboards`)
  const due = dueElectionBoards(
    stored.map((r) => ({
      board: r.board,
      kind: r.kind,
      updatedTime: new Date(r.updated_time).getTime(),
    })),
    now
  )
  const result: ElectionLeaderboardsRebuild = {
    rebuilt: [],
    skipped: ELECTION_LEADERBOARDS.filter((b) => !due.includes(b)).map(
      (b) => b.key
    ),
    failed: [],
  }
  for (const board of due) {
    const started = Date.now()
    try {
      await rebuildBoard(pg, board, now)
      result.rebuilt.push(board.key)
      log(`[election-leaderboards] ${board.key} rebuilt`, {
        ms: Date.now() - started,
      })
    } catch (e) {
      result.failed.push(board.key)
      log.error(`[election-leaderboards] ${board.key} failed`, {
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return result
}

/**
 * The stored boards (assembleElectionLeaderboards). None before migration
 * 2026110601 or the first rebuild.
 */
export async function getElectionLeaderboards(
  pg: SupabaseDirectClient
): Promise<ElectionLeaderboards> {
  if (!(await tableExists(pg))) return { boards: [] }
  const rows = await pg.manyOrNone<StoredBoardRow>(
    `select board, kind, entries, updated_time from election_leaderboards`
  )
  return assembleElectionLeaderboards(rows)
}
