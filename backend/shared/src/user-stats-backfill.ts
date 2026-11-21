import { SupabaseDirectClient } from 'shared/supabase/init'

// Adds the trades made before the user_stats triggers were installed, one
// created_time window per call. See dev-docs/user-stats.md and the migration
// 2026112220_user_stats.sql.
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
  window: string // a Postgres interval, e.g. '6 hours'
): Promise<UserStatsBackfillStep> {
  return await pg.tx(async (tx) => {
    // Give way to bets: a bet holds its users' stats rows for milliseconds,
    // and this gives up on a wait well before the deadlock detector (1 s)
    // could pick a bet to fail. The caller retries the window.
    await tx.none(`set local lock_timeout = '500ms'`)
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
           then least(lo + $1::interval, bound + interval '1 microsecond')::text
         end as to,
         completed_time is not null as completed
       from p`,
      [window]
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
         insert into user_stats as s (user_id, trades, updated_time)
         select user_id, count(*), now()
         from counted
         group by user_id
         order by user_id
         on conflict (user_id) do update
           set trades = s.trades + excluded.trades,
               updated_time = excluded.updated_time
         returning 1
       )
       select
         (select count(*) from counted)::int as bets,
         (select count(*) from added)::int as users`,
      [progress.from, progress.to]
    )

    const { completed } = await tx.one<{ completed: boolean }>(
      `update user_stats_backfill
       set done_before = $1::timestamptz,
         completed_time = case when $1::timestamptz > bound then now() end,
         updated_time = now()
       where stat = 'trades'
       returning completed_time is not null as completed`,
      [progress.to]
    )
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
