import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'

// Keeps ach_trades (each user's trade count and rank, read by
// backend/api/src/get-user-achievements.ts) current. A trade is a contract_bets
// row that is not a redemption, is filled, is not cancelled, was not placed
// through the API, and is on a MANA market.
//
// The first version scanned contract_bets for every bet newer than each user's
// last_updated, which no index serves: ~86M rows per run, so it was never
// switched on and ach_trades stopped at 2025-09-05. This version walks
// contract_bets forward in created_time windows on contract_bets_created_time_only,
// from a watermark in job_watermarks, and adds each window's counts per user.
//
// - A window and its watermark advance commit together, under a row lock on
//   the watermark, so a crash or an overlapping run can neither skip a window
//   nor count one twice.
// - The first run starts at max(ach_trades.last_updated): the bet the last
//   full pass saw last. Nothing at or before it is counted again, and the
//   per-user guard (created_time > the row's last_updated) means a watermark
//   that is ever moved back cannot double count either.
// - A run applies at most MAX_WINDOWS_PER_RUN windows or RUN_BUDGET_MS of work,
//   so the 14-month backlog spreads over several days of hourly runs.
// - Windows stop LAG short of now(): a bet's created_time is set in Node before
//   its transaction commits, and a window must not pass a bet still in flight.
//
// A bet counts if it qualifies when its window is applied, as in the first
// version. A limit order that fills after that is not counted later: 4-5% of
// trades at this 10-minute lag, ~2% at a one-day lag (two prod samples, Nov 2026).
const JOB_NAME = 'update-ach-trades'
const WINDOW = '6 hours'
const LAG = '10 minutes'
const MAX_WINDOWS_PER_RUN = 16
const RUN_BUDGET_MS = 3 * 60 * 1000

export type AchTradesRunOptions = {
  maxWindows: number
  budgetMs: number
  // A Postgres interval; tests shorten it rather than wait.
  lag?: string
}

const DEFAULT_OPTIONS: AchTradesRunOptions = {
  maxWindows: MAX_WINDOWS_PER_RUN,
  budgetMs: RUN_BUDGET_MS,
}

type AppliedWindow = {
  lo: string
  hi: string
  users: number
  trades: number
}

export const updateAchTrades = async (
  pg: SupabaseDirectClient = createSupabaseDirectClient(),
  options: AchTradesRunOptions = DEFAULT_OPTIONS
) => {
  const startedAt = Date.now()
  const { maxWindows, budgetMs, lag = LAG } = options

  // First run only: ach_trades already holds every trade up to its newest
  // last_updated. With no rows (a fresh database), start before the first bet.
  await pg.none(
    `insert into job_watermarks (job_name, watermark)
     select $1, coalesce(
       (select max(last_updated) from ach_trades),
       (select min(created_time) from contract_bets) - interval '1 millisecond',
       now() - $2::interval
     )
     where not exists (select 1 from job_watermarks where job_name = $1)
     on conflict (job_name) do nothing`,
    [JOB_NAME, lag]
  )

  // One cutoff for the whole run, so the last window is not followed by a
  // string of seconds-long ones as now() moves.
  const { cutoff } = await pg.one<{ cutoff: string }>(
    `select (now() - $1::interval)::text as cutoff`,
    [lag]
  )

  let windows = 0
  let users = 0
  let trades = 0
  let watermark: string | undefined
  while (windows < maxWindows && Date.now() - startedAt < budgetMs) {
    const windowStart = Date.now()
    const applied = await applyNextWindow(pg, cutoff)
    if (!applied) break
    windows++
    users += applied.users
    trades += applied.trades
    watermark = applied.hi
    log(
      `update-ach-trades: applied (${applied.lo}, ${applied.hi}]: ${
        applied.trades
      } trades by ${applied.users} users in ${Date.now() - windowStart}ms`
    )
  }

  if (windows === 0) {
    log('update-ach-trades: up to date, nothing to apply')
    return
  }

  const { changed } = await pg.tx(async (tx) => {
    // The same lock as the windows, so two overlapping runs never update
    // ach_trades rows in opposite orders.
    await lockWatermark(tx)
    return await tx.one<{ changed: number }>(
      `with ranks as (
         select user_id, rank() over (order by total_trades_count desc) as r
         from ach_trades
       ),
       changed as (
         update ach_trades t
         set trades_rank = ranks.r
         from ranks
         where t.user_id = ranks.user_id
           and t.trades_rank is distinct from ranks.r
         returning 1
       )
       select count(*)::int as changed from changed`
    )
  })

  log(
    `update-ach-trades: ${windows} windows, ${trades} trades, ${users} row upserts, ${changed} ranks changed; watermark ${watermark}, cutoff ${cutoff}, ${
      Date.now() - startedAt
    }ms`
  )
}

const lockWatermark = (tx: SupabaseDirectClient) =>
  tx.oneOrNone(`select 1 from job_watermarks where job_name = $1 for update`, [
    JOB_NAME,
  ])

// Applies the window after the watermark and advances the watermark, in one
// transaction. Returns null once the watermark has reached the cutoff.
const applyNextWindow = (pg: SupabaseDirectClient, cutoff: string) =>
  pg.tx(async (tx): Promise<AppliedWindow | null> => {
    // A window starts at the next bet, so a stretch with no bets (on a fresh
    // or quiet database) costs one window, not one per 6 hours. Timestamps go
    // to and from Postgres as text to keep their microseconds.
    const bounds = await tx.oneOrNone<{ lo: string; hi: string }>(
      `select w.watermark::text as lo,
         least(
           coalesce(
             (select min(b.created_time) from contract_bets b
              where b.created_time > w.watermark),
             $2::timestamptz
           ) + $3::interval,
           $2::timestamptz
         )::text as hi
       from job_watermarks w
       where w.job_name = $1 and w.watermark < $2::timestamptz
       for update`,
      [JOB_NAME, cutoff, WINDOW]
    )
    if (!bounds) return null

    const { users, trades } = await tx.one<{ users: number; trades: number }>(
      `with deltas as (
         select b.user_id, count(*)::int as trades, max(b.created_time) as last_trade
         from contract_bets b
         join contracts c on c.id = b.contract_id
         left join ach_trades t on t.user_id = b.user_id
         where b.created_time > $1::timestamptz
           and b.created_time <= $2::timestamptz
           and coalesce(b.is_redemption, false) = false
           and coalesce(b.is_filled, true) = true
           and coalesce(b.is_cancelled, false) = false
           and (b.is_api is null or b.is_api = false)
           and c.token = 'MANA'
           and b.created_time > coalesce(t.last_updated, '-infinity'::timestamptz)
         group by b.user_id
       ),
       applied as (
         insert into ach_trades (user_id, total_trades_count, last_updated)
         select user_id, trades, last_trade from deltas
         on conflict (user_id) do update
           set total_trades_count = ach_trades.total_trades_count + excluded.total_trades_count,
               last_updated = greatest(ach_trades.last_updated, excluded.last_updated)
         returning 1
       )
       select (select count(*) from applied)::int as users,
              (select coalesce(sum(trades), 0) from deltas)::int as trades`,
      [bounds.lo, bounds.hi]
    )

    await tx.none(
      `update job_watermarks
       set watermark = $2::timestamptz, updated_time = now()
       where job_name = $1`,
      [JOB_NAME, bounds.hi]
    )
    return { ...bounds, users, trades }
  })
