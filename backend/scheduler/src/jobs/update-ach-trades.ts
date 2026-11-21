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
// - A window's counts and its watermark advance commit together, under a row
//   lock on the watermark, so a crash or an overlapping run can neither skip a
//   window nor count one twice.
// - The first run starts at max(ach_trades.last_updated): the newest trade the
//   last full pass counted. Prod samples before it found every trader with a
//   row and no uncounted trades except limit orders that filled afterwards.
//   The per-user guard (created_time > the row's last_updated) means a
//   watermark that is ever moved back cannot double count.
// - Limit orders still open when their window is applied go to
//   ach_trades_open_orders and are counted when they fill (dropped if
//   cancelled, or after OPEN_ORDER_HORIZON). Without this, the 4-5% of trades
//   that are limit orders filling after their window would never count.
// - A run starts no window after MAX_WINDOWS_PER_RUN windows or RUN_BUDGET_MS,
//   so the 14-month backlog spreads over several days of hourly runs. Every
//   statement runs under a server-side statement and lock timeout, so even a
//   run whose last window starts just inside the budget, and whose statements
//   all hit their timeouts, ends within about a quarter hour. A normal run
//   takes about a minute.
// - Windows stop LAG short of now(). A bet's created_time is set inside its
//   transaction, before the commit, so a window must not pass bets still in
//   flight. API statements and idle transactions time out after 60 s, so 30
//   minutes is a wide margin, not a guarantee: a bet committed later than that
//   would be missed.
const JOB_NAME = 'update-ach-trades'
const WINDOW = '6 hours'
const LAG = '30 minutes'
const OPEN_ORDER_HORIZON = '30 days'
const MAX_WINDOWS_PER_RUN = 16
const RUN_BUDGET_MS = 3 * 60 * 1000
const STATEMENT_TIMEOUT = '2min'
const LOCK_TIMEOUT = '1min'

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
  opened: number
}

export const updateAchTrades = async (
  pg: SupabaseDirectClient = createSupabaseDirectClient(),
  options: AchTradesRunOptions = DEFAULT_OPTIONS
) => {
  const startedAt = Date.now()
  const { maxWindows, budgetMs, lag = LAG } = options

  const cutoff = await cappedTx(pg, async (tx) => {
    // First run only: ach_trades already holds every trade up to its newest
    // last_updated. With no rows (a fresh database), start before the first
    // bet.
    await tx.none(
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
    return (
      await tx.one<{ cutoff: string }>(
        `select (now() - $1::interval)::text as cutoff`,
        [lag]
      )
    ).cutoff
  })

  let windows = 0
  let trades = 0
  let opened = 0
  let watermark: string | undefined
  while (windows < maxWindows && Date.now() - startedAt < budgetMs) {
    const windowStart = Date.now()
    const applied = await applyNextWindow(pg, cutoff)
    if (!applied) break
    windows++
    trades += applied.trades
    opened += applied.opened
    watermark = applied.hi
    log(
      `update-ach-trades: applied (${applied.lo}, ${applied.hi}]: ${
        applied.trades
      } trades by ${applied.users} users, ${
        applied.opened
      } open limit orders in ${Date.now() - windowStart}ms`
    )
  }

  const settled = await settleOpenOrders(pg)

  let ranksChanged = 0
  if (windows > 0 || settled.trades > 0) {
    ranksChanged = await lockedTx(
      pg,
      async (tx) =>
        (
          await tx.one<{ changed: number }>(
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
        ).changed
    )
  }

  log(
    `update-ach-trades: ${windows} windows (${trades} trades, ${opened} open limit orders), ${
      settled.trades
    } filled limit orders counted, ${
      settled.dropped
    } open orders aged out, ${ranksChanged} ranks changed; watermark ${
      watermark ?? 'unchanged'
    }, cutoff ${cutoff}, ${Date.now() - startedAt}ms`
  )
}

// Runs fn in a transaction whose statements and lock waits are capped
// server-side (the scheduler client's default statement_timeout is 59 minutes).
const cappedTx = <T>(
  pg: SupabaseDirectClient,
  fn: (tx: SupabaseDirectClient) => Promise<T>
) =>
  pg.tx(async (tx) => {
    await tx.none(`set local statement_timeout = $1`, [STATEMENT_TIMEOUT])
    await tx.none(`set local lock_timeout = $1`, [LOCK_TIMEOUT])
    return await fn(tx)
  })

// A capped transaction that first takes the job's row lock in job_watermarks.
// Every write the job makes to ach_trades and ach_trades_open_orders happens
// under that lock, so two overlapping runs serialize instead of interleaving.
const lockedTx = <T>(
  pg: SupabaseDirectClient,
  fn: (tx: SupabaseDirectClient, watermark: string | null) => Promise<T>
) =>
  cappedTx(pg, async (tx) => {
    const row = await tx.oneOrNone<{ watermark: string }>(
      `select watermark::text as watermark from job_watermarks
       where job_name = $1 for update`,
      [JOB_NAME]
    )
    return await fn(tx, row?.watermark ?? null)
  })

// Applies the window after the watermark and advances the watermark, in one
// transaction. Returns null once the watermark has reached the cutoff.
const applyNextWindow = (pg: SupabaseDirectClient, cutoff: string) =>
  lockedTx(pg, async (tx, lo): Promise<AppliedWindow | null> => {
    if (lo === null) return null
    // A window starts at the next bet, so a stretch with no bets (on a fresh
    // or quiet database) costs one window, not one per 6 hours. Timestamps go
    // to and from Postgres as text to keep their microseconds.
    const { hi } = await tx.one<{ hi: string | null }>(
      `select case when $1::timestamptz < $2::timestamptz then
         least(
           coalesce(
             (select min(b.created_time) from contract_bets b
              where b.created_time > $1::timestamptz),
             $2::timestamptz
           ) + $3::interval,
           $2::timestamptz
         )::text
       end as hi`,
      [lo, cutoff, WINDOW]
    )
    if (hi === null) return null

    const applied = await tx.one<{
      users: number
      trades: number
      opened: number
    }>(
      `with window_bets as (
         select b.bet_id, b.user_id, b.created_time,
           coalesce(b.is_filled, true) as is_filled,
           coalesce(b.is_cancelled, false) as is_cancelled
         from contract_bets b
         join contracts c on c.id = b.contract_id
         where b.created_time > $1::timestamptz
           and b.created_time <= $2::timestamptz
           and coalesce(b.is_redemption, false) = false
           and (b.is_api is null or b.is_api = false)
           and c.token = 'MANA'
       ),
       deltas as (
         select w.user_id, count(*)::int as trades, max(w.created_time) as last_trade
         from window_bets w
         left join ach_trades t on t.user_id = w.user_id
         where w.is_filled and not w.is_cancelled
           and w.created_time > coalesce(t.last_updated, '-infinity'::timestamptz)
           -- An order already waiting to fill is counted only by settleOpenOrders.
           and not exists (
             select 1 from ach_trades_open_orders o where o.bet_id = w.bet_id
           )
         group by w.user_id
       ),
       applied as (
         insert into ach_trades (user_id, total_trades_count, last_updated)
         select user_id, trades, last_trade from deltas
         on conflict (user_id) do update
           set total_trades_count = ach_trades.total_trades_count + excluded.total_trades_count,
               last_updated = greatest(ach_trades.last_updated, excluded.last_updated)
         returning 1
       ),
       opened as (
         insert into ach_trades_open_orders (bet_id, created_time)
         select bet_id, created_time from window_bets
         where not is_filled and not is_cancelled
           and created_time > now() - $3::interval
         on conflict (bet_id) do nothing
         returning 1
       )
       select (select count(*) from applied)::int as users,
              (select coalesce(sum(trades), 0) from deltas)::int as trades,
              (select count(*) from opened)::int as opened`,
      [lo, hi, OPEN_ORDER_HORIZON]
    )

    await tx.none(
      `update job_watermarks
       set watermark = $2::timestamptz, updated_time = now()
       where job_name = $1`,
      [JOB_NAME, hi]
    )
    return { lo, hi, ...applied }
  })

// Counts the open limit orders that have since filled, forgets those that were
// cancelled, and drops any older than OPEN_ORDER_HORIZON (mostly orders on
// markets that closed with the order still open).
const settleOpenOrders = (pg: SupabaseDirectClient) =>
  lockedTx(pg, async (tx) => {
    const { trades } = await tx.one<{ trades: number }>(
      `with settled as (
         delete from ach_trades_open_orders o
         using contract_bets b
         where b.bet_id = o.bet_id
           and (coalesce(b.is_filled, true) or coalesce(b.is_cancelled, false))
         returning b.user_id, b.created_time,
           coalesce(b.is_filled, true) and not coalesce(b.is_cancelled, false) as is_trade
       ),
       deltas as (
         select user_id, count(*)::int as trades, max(created_time) as last_trade
         from settled
         where is_trade
         group by user_id
       ),
       applied as (
         insert into ach_trades (user_id, total_trades_count, last_updated)
         select user_id, trades, last_trade from deltas
         on conflict (user_id) do update
           set total_trades_count = ach_trades.total_trades_count + excluded.total_trades_count,
               last_updated = greatest(ach_trades.last_updated, excluded.last_updated)
         returning 1
       )
       select (select coalesce(sum(trades), 0) from deltas)::int as trades,
              (select count(*) from applied)::int as upserts`
    )
    const { dropped } = await tx.one<{ dropped: number }>(
      `with dropped as (
         delete from ach_trades_open_orders
         where created_time <= now() - $1::interval
         returning 1
       )
       select count(*)::int as dropped from dropped`,
      [OPEN_ORDER_HORIZON]
    )
    return { trades, dropped }
  })
