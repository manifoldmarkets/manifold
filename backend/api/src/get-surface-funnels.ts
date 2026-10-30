import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'

// The /stats page funnels, for admins: daily_surface_funnels is not readable
// by anon or authenticated clients.
export const getSurfaceFunnels: APIHandler<'get-surface-funnels'> = async (
  { limitDays },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can view page funnels')
  }

  const pg = createSupabaseDirectClient()
  const days = await pg.map(
    `select start_date::text as date, funnels
    from daily_surface_funnels
    where start_date >= current_date - $1::int
    order by start_date`,
    [limitDays],
    (r) => ({ date: r.date as string, funnels: r.funnels as unknown })
  )
  return { days }
}
