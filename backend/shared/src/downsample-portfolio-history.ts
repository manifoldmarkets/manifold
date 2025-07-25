import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

const TESTING = false
export async function downsamplePortfolioHistory() {
  const db = createSupabaseDirectClient()
  log('Starting portfolio history downsampling')
  const userIds = TESTING
    ? ['rZe5vReIBSYJpUymsFBWW1aUyp13']
    : await db.map(
        `select distinct id from users
            left join portfolios_processed p on p.user_id = users.id
            where data->>'lastBetTime' is not null
            and created_time < now() - interval '1 month'
            and (p.user_id is null or p.last_processed < now() - interval '1 week')`,
        [],
        (u) => u.id
      )
  log(`Downsampling portfolio history for ${userIds.length} users `)

  for (const userId of userIds) {
    await db.tx(async (tx) => {
      const daysToProcess = await tx.manyOrNone<{
        user_id: string
        day: string
      }>(
        `
        select p.user_id, p.day from (
          select
            user_id,
            date_trunc('day', ts) as day,
            count(*) as daily_count
          from user_portfolio_history
          where user_id = $1
          and ts < now() - interval '1 month'
          group by user_id, date_trunc('day', ts)
        ) as p
        where p.daily_count > 4
      `,
        [userId]
      )

      if (daysToProcess.length === 0) return

      log(`Found ${daysToProcess.length} user-days to process for ${userId}.`)

      const userIds = daysToProcess.map((d) => d.user_id)
      const days = daysToProcess.map((d) => d.day)

      await tx.none(
        `
      with
        days_to_process_unnested as (
          select *
          from unnest($1::text[], $2::timestamp[]) as t(user_id, day)
        ),
        points_to_process as (
          select p.id
          from user_portfolio_history p
            join days_to_process_unnested d
            on p.user_id = d.user_id
            and date_trunc('day', p.ts) = d.day
        ),
        deleted_points as (
          delete from user_portfolio_history
          where id in (select id from points_to_process)
          returning *
        ),
        archived_points as (
          insert into
            user_portfolio_history_archive (
              user_id,
              ts,
              balance,
              cash_balance,
              investment_value,
              total_deposits,
              loan_total,
              profit,
              cash_investment_value,
              total_cash_deposits,
              spice_balance
            )
          select
            user_id,
            ts,
            balance,
            cash_balance,
            investment_value,
            total_deposits,
            loan_total,
            profit,
            cash_investment_value,
            total_cash_deposits,
            spice_balance
          from deleted_points
        ),
        new_points as (
          select
            p.user_id,
            (
              date_trunc('day', p.ts) +
              (floor(extract(hour from p.ts) / 6) * interval '6 hours')
            ) as ts,
            avg(p.balance) as balance,
            avg(p.cash_balance) as cash_balance,
            avg(p.cash_investment_value) as cash_investment_value,
            avg(p.investment_value) as investment_value,
            avg(p.loan_total) as loan_total,
            avg(p.profit) as profit,
            avg(p.spice_balance) as spice_balance,
            avg(p.total_cash_deposits) as total_cash_deposits,
            avg(p.total_deposits) as total_deposits
          from deleted_points p
          group by
            p.user_id,
            date_trunc('day', p.ts),
            floor(extract(hour from p.ts) / 6)
        )
      insert into
        user_portfolio_history (
          user_id,
          ts,
          balance,
          cash_balance,
          cash_investment_value,
          investment_value,
          loan_total,
          profit,
          spice_balance,
          total_cash_deposits,
          total_deposits
        )
      select
        user_id,
        ts,
        balance,
        cash_balance,
        cash_investment_value,
        investment_value,
        loan_total,
        profit,
        spice_balance,
        total_cash_deposits,
        total_deposits
      from new_points
      `,
        [userIds, days]
      )
      await tx.none(
        `
        insert into portfolios_processed (user_id)
        values ($1) on conflict (user_id) do update set last_processed = now()
        `,
        [userId]
      )
    })
  }
  log('Finished portfolio history downsampling')
}
