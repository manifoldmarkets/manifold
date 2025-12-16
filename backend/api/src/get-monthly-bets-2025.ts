import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getmonthlybets2025: APIHandler<
  'get-monthly-bets-2025'
> = async (props) => {
  const { userId } = props
  const pg = createSupabaseDirectClient()

  const data = await pg.manyOrNone(
    `
    SELECT
      to_char(date_trunc('month', created_time), 'YYYY-MM') || '-01T00:00:00.000Z' as month,
      COUNT(*)::int as bet_count,
      COALESCE(SUM(ABS(amount)), 0)::float as total_amount
    FROM contract_bets
    WHERE user_id = $1
      AND created_time >= '2025-01-01'::timestamp
      AND created_time <= '2025-12-31 23:59:59'::timestamp
    GROUP BY date_trunc('month', created_time)
    ORDER BY month
    `,
    [userId]
  )

  return data
}

