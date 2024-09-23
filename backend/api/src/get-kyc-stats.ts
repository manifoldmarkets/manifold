import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getKYCStats: APIHandler<'get-kyc-stats'> = async () => {
  const pg = createSupabaseDirectClient()

  const initialVerifications = await pg.manyOrNone<{
    count: number
    day: string
  }>(`
    select count(*), date_trunc('day', created_time) as day
    from txns where category = 'KYC_BONUS'
    group by date_trunc('day', created_time)
    order by date_trunc('day', created_time) asc`)

  const phoneVerifications = await pg.manyOrNone<{
    count: number
    day: string
  }>(`
    select count(*), date_trunc('day', created_time) as day
    from private_user_phone_numbers
    group by date_trunc('day', created_time)
    order by day asc`)

  return { initialVerifications, phoneVerifications }
}
