import { SupabaseDirectClient } from 'shared/supabase/init'

// Adds the trades made before the user_stats triggers were installed, one
// created_time window per call, into user_stats_baseline (never user_stats,
// which bets write: a bet can't wait on this or fail to serialize because of
// it). See dev-docs/user-stats.md and the migration 2026112220_user_stats.sql.
//
// Each window runs in one transaction that first locks the stat's progress
// row, so two runs can never add the same window, and moves the progress in
// the same transaction as the counts, so a crash or retry can't skip or repeat
// one. The counting is a single statement, so it sees every bet and journal
// row as of one moment: a bet that existed at the install either hasn't
// changed yet (counted as it is) or has a journal row holding its state at the
// install (counted from that), never both.

export type UserStatsBackfillStep = {
  // The window added, as Postgres timestamps (text keeps the microseconds).
  from: string | null
  to: string | null
  bets: number
  users: number
  completed: boolean
}

export async function backfillUserStatsWindow(
  pg: SupabaseDirectClient,
  windowSeconds: number
): Promise<UserStatsBackfillStep> {
  // A window that isn't positive would move the progress back, and the next
  // run would add those trades again.
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error(
      `Window must be a whole number of seconds, at least 1: ${windowSeconds}`
    )
  }
  return await pg.tx(async (tx) => {
    // Only another run of this holds the progress row; don't queue behind it.
    await tx.none(`set local lock_timeout = '5s'`)
    await tx.none(`set local statement_timeout = '120s'`)

    const progress = await tx.oneOrNone<{
      from: string | null
      to: string | null
      completed: boolean
    }>(
      `with p as (
         select bound, completed_time,
           coalesce(done_before, least(
             (select min(created_time) from contract_bets),
             (select min(created_time) from user_stats_bet_journal where existed)
           )) as lo
         from user_stats_backfill
         where stat = 'trades'
         for update
       )
       select
         case when lo <= bound then lo::text end as from,
         case when lo <= bound
           then least(
             lo + make_interval(secs => $1),
             bound + interval '1 microsecond'
           )::text
         end as to,
         completed_time is not null as completed
       from p`,
      [windowSeconds]
    )
    if (!progress) {
      throw new Error(
        'user_stats_backfill has no trades row: run migration 2026112220_user_stats.sql first'
      )
    }
    if (progress.completed) {
      return { from: null, to: null, bets: 0, users: 0, completed: true }
    }
    if (progress.from === null || progress.to === null) {
      // Nothing (left) to add: no bets at or before the bound.
      await tx.none(
        `update user_stats_backfill
         set completed_time = now(), updated_time = now()
         where stat = 'trades'`
      )
      return { from: null, to: null, bets: 0, users: 0, completed: true }
    }

    const { bets, users } = await tx.one<{ bets: number; users: number }>(
      `with counted as (
         select b.user_id
         from contract_bets b
         join contracts c on c.id = b.contract_id and c.token = 'MANA'
         where b.created_time >= $1::timestamptz
           and b.created_time < $2::timestamptz
           and user_stats_bet_trades(
             b.amount, b.is_redemption, b.is_api,
             coalesce(b.data ->> 'isAutoRedemption' = 'true', false)
           ) = 1
           and not exists (
             select 1 from user_stats_bet_journal j where j.bet_id = b.bet_id
           )
         union all
         select j.user_id
         from user_stats_bet_journal j
         join contracts c on c.id = j.contract_id and c.token = 'MANA'
         where j.existed
           and j.created_time >= $1::timestamptz
           and j.created_time < $2::timestamptz
           and user_stats_bet_trades(
             j.amount, j.is_redemption, j.is_api, j.is_auto_redemption
           ) = 1
       ),
       added as (
         insert into user_stats_baseline as s (user_id, trades)
         select user_id, count(*)
         from counted
         group by user_id
         order by user_id
         on conflict (user_id) do update
           set trades = s.trades + excluded.trades
         returning 1
       )
       select
         (select count(*) from counted)::int as bets,
         (select count(*) from added)::int as users`,
      [progress.from, progress.to]
    )

    // Progress only moves forward; anything else is a bug, so stop.
    const moved = await tx.oneOrNone<{ completed: boolean }>(
      `update user_stats_backfill
       set done_before = $2::timestamptz,
         completed_time = case when $2::timestamptz > bound then now() end,
         updated_time = now()
       where stat = 'trades'
         and $2::timestamptz > $1::timestamptz
         and (done_before is null or done_before = $1::timestamptz)
       returning completed_time is not null as completed`,
      [progress.from, progress.to]
    )
    if (!moved) {
      throw new Error(
        `Backfill progress did not move forward from ${progress.from} to ${progress.to}`
      )
    }
    const { completed } = moved
    return { from: progress.from, to: progress.to, bets, users, completed }
  })
}

// Whether user_stats.trades is complete, i.e. the backfill has finished.
// False if the migration hasn't run yet.
export async function isUserStatsTradesReady(pg: SupabaseDirectClient) {
  // Two statements: a missing table fails a statement that names it, even in
  // a branch that isn't taken.
  const { exists } = await pg.one<{ exists: boolean }>(
    `select to_regclass('public.user_stats_backfill') is not null as exists`
  )
  if (!exists) return false
  const row = await pg.oneOrNone<{ ready: boolean }>(
    `select completed_time is not null as ready from user_stats_backfill
     where stat = 'trades'`
  )
  return row?.ready ?? false
}
