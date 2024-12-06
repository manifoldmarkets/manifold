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
max_profit as (
    select
        profit,
        has_yes_shares,
        has_no_shares,
        answer_id,
        data
    from 
        filtered_data
    where 
        profit = (select max(profit) from filtered_data)
    limit 1  ),
min_profit as (
    select
        profit,
        has_yes_shares,
        has_no_shares,
        answer_id,
        data
    from 
        filtered_data
    where 
        profit = (select min(profit) from filtered_data)
    limit 1 
)
select * from max_profit
union all
select * from min_profit
order by profit desc;
      `,
    [userId]
  )

  return data
}
