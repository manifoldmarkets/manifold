import { APIHandler } from 'api/helpers/endpoint'
import { getPerpPoolStats } from 'shared/perps/pool-stats'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getPerpStats: APIHandler<'get-perp-stats'> = async ({
  limitDays,
}) => getPerpPoolStats(createSupabaseDirectClient(), limitDays)
