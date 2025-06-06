import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getmonthlybets2024: APIHandler<'get-monthly-bets-2024'> = async (
  props
) => {
  const { userId } = props
  const pg = createSupabaseDirectClient()

  const data = await pg.manyOrNone(
    `
      with months as (
        select 
          to_char(generate_series(
            '2024-01-01'::timestamp with time zone,
            '2024-12-01'::timestamp with time zone,
            '1 month'::interval
          ), 'YYYY-MM') as month
      ),
      user_bets as (
        select
          to_char(date_trunc('month', created_time), 'YYYY-MM') as month,
          count(*) as bet_count,
          coalesce(sum(abs(amount)), 0) as total_amount
        from contract_bets
        where 
          user_id = $1
          and created_time >= '2024-01-01'::timestamp with time zone
          and created_time < '2025-01-01'::timestamp with time zone
          and not coalesce(is_cancelled, false)
          and not coalesce(is_redemption, false)
        group by date_trunc('month', created_time)
      )
      select
        months.month,
        coalesce(user_bets.bet_count, 0) as bet_count,
        coalesce(user_bets.total_amount, 0) as total_amount
      from months
      left join user_bets on months.month = user_bets.month
      order by months.month
      `,
    [userId]
  )

  return data
}
