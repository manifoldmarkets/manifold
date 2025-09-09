import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export const updateAchTrades = async () => {
  const pg = createSupabaseDirectClient()

  log('update-ach-trades: ensure rows for all users')
  await pg.none(`
    insert into ach_trades (user_id, total_trades_count, last_updated)
    select u.id, 0, to_timestamp(0)
    from users u
    on conflict (user_id) do nothing
  `)

  log('update-ach-trades: apply incremental deltas')
  await pg.none(`
    with deltas as (
      select
        b.user_id,
        count(*)::int as delta_trades,
        max(b.created_time) as new_last
      from contract_bets b
      join contracts c on c.id = b.contract_id
      left join ach_trades at on at.user_id = b.user_id
      where coalesce(b.is_redemption, false) = false
        and coalesce(b.is_filled, true) = true
        and coalesce(b.is_cancelled, false) = false
        and (b.is_api is null or b.is_api = false)
        and c.token = 'MANA'
        and b.created_time > coalesce(at.last_updated, to_timestamp(0))
      group by b.user_id
    )
    insert into ach_trades (user_id, total_trades_count, last_updated)
    select user_id, delta_trades, new_last from deltas
    on conflict (user_id) do update
      set total_trades_count = ach_trades.total_trades_count + excluded.total_trades_count,
          last_updated = greatest(ach_trades.last_updated, excluded.last_updated)
  `)

  log('update-ach-trades: recompute ranks')
  await pg.none(`
    with ranks as (
      select
        user_id,
        rank() over (order by total_trades_count desc) as r,
        count(*) over () as n
      from ach_trades
    )
    update ach_trades t
    set trades_rank = r.r
    from ranks r
    where t.user_id = r.user_id
  `)

  log('update-ach-trades: done')
}
