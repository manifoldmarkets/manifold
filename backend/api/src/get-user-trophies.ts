import { APIHandler } from 'api/helpers/endpoint'
import { getShowcasePins, getTrophyClaims } from 'api/helpers/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUserTrophies: APIHandler<'get-user-trophies'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()
  const [claims, pins] = await Promise.all([
    getTrophyClaims(pg, userId),
    getShowcasePins(pg, userId),
  ])
  return { claims, pins }
}
