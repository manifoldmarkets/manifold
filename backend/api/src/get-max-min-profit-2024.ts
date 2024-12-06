import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getmaxminprofit2024: APIHandler<
  'get-max-min-profit-2024'
> = async (props) => {
  const { userId } = props
  const pg = createSupabaseDirectClient()

  const data = await pg.manyOrNone(
    `
with filtered_data as (
    select
        ucm.profit,
        ucm.has_yes_shares,
        ucm.has_no_shares,
        ucm.answer_id,
        c.data
    from 
        user_contract_metrics ucm
    join 
        contracts c on ucm.contract_id = c.id
    where 
        ucm.user_id = $1
        and c.token = 'MANA'
        and c.resolution_time >= '2024-01-01'::timestamp
        and c.resolution_time <= '2024-12-31 23:59:59'::timestamp
),
min_max_profits as (
    select
        max(profit) as max_profit,
        min(profit) as min_profit
    from 
        filtered_data
)
select
    fd.profit,
    fd.has_yes_shares,
    fd.has_no_shares,
    fd.answer_id,
    fd.data
from 
    filtered_data fd
join 
    min_max_profits mmp on fd.profit = mmp.max_profit or fd.profit = mmp.min_profit
    order by fd.profit desc;
      `,
    [userId]
  )

  return data
}
