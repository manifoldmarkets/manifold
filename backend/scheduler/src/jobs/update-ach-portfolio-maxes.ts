import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export const updateAchPortfolioMaxes = async () => {
  const pg = createSupabaseDirectClient()

  log('update-ach-portfolio-maxes: ensure rows for all users')
  await pg.none(`
    insert into ach_portfolio_maxes (
      user_id,
      highest_balance_mana,
      highest_invested_mana,
      highest_networth_mana,
      highest_loan_mana,
      total_profit_mana,
      last_updated
    )
    select u.id, 0, 0, 0, 0, 0, to_timestamp(0)
    from users u
    on conflict (user_id) do nothing
  `)

  log('update-ach-portfolio-maxes: apply incremental maxes')
  await pg.none(`
    with deltas as (
      select
        h.user_id,
        max(h.balance) as max_balance,
        max(h.investment_value) as max_invested,
        max(h.balance + h.investment_value) as max_networth,
        max(h.loan_total) as max_loan,
        max(coalesce(h.profit, h.balance + h.investment_value - h.total_deposits)) as max_total_profit,
        max(h.ts) as new_last
      from user_portfolio_history h
      left join ach_portfolio_maxes apm on apm.user_id = h.user_id
      where h.ts > coalesce(apm.last_updated, to_timestamp(0))
      group by h.user_id
    )
    insert into ach_portfolio_maxes (
      user_id,
      highest_balance_mana,
      highest_invested_mana,
      highest_networth_mana,
      highest_loan_mana,
      total_profit_mana,
      last_updated
    )
    select
      user_id,
      coalesce(max_balance, 0),
      coalesce(max_invested, 0),
      coalesce(max_networth, 0),
      coalesce(max_loan, 0),
      coalesce(max_total_profit, 0),
      new_last
    from deltas
    on conflict (user_id) do update
      set highest_balance_mana = greatest(ach_portfolio_maxes.highest_balance_mana, excluded.highest_balance_mana),
          highest_invested_mana = greatest(ach_portfolio_maxes.highest_invested_mana, excluded.highest_invested_mana),
          highest_networth_mana = greatest(ach_portfolio_maxes.highest_networth_mana, excluded.highest_networth_mana),
          highest_loan_mana = greatest(ach_portfolio_maxes.highest_loan_mana, excluded.highest_loan_mana),
          total_profit_mana = greatest(ach_portfolio_maxes.total_profit_mana, excluded.total_profit_mana),
          last_updated = greatest(ach_portfolio_maxes.last_updated, excluded.last_updated)
  `)

  log('update-ach-portfolio-maxes: recompute ranks')
  await pg.none(`
    with ranks as (
      select
        user_id,
        rank() over (order by highest_balance_mana desc) as highest_balance_rank,
        rank() over (order by highest_invested_mana desc) as highest_invested_rank,
        rank() over (order by highest_networth_mana desc) as highest_networth_rank,
        rank() over (order by highest_loan_mana desc) as highest_loan_rank,
        rank() over (order by total_profit_mana desc) as total_profit_rank
      from ach_portfolio_maxes
    )
    update ach_portfolio_maxes p
    set highest_balance_rank = r.highest_balance_rank,
        highest_invested_rank = r.highest_invested_rank,
        highest_networth_rank = r.highest_networth_rank,
        highest_loan_rank = r.highest_loan_rank,
        total_profit_rank = r.total_profit_rank
    from ranks r
    where p.user_id = r.user_id
  `)

  log('update-ach-portfolio-maxes: done')
}
