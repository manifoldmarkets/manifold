import { randomUUID } from 'crypto'
import { isAdminId } from 'common/envs/constants'
import { DAY_MS } from 'common/util/time'
import { grantMembershipDays } from 'shared/membership-grants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'

export const adminGrantMembershipDays: APIHandler<
  'admin-grant-membership-days'
> = async ({ userId, tier, days, note }, auth) => {
  if (!isAdminId(auth.uid)) throw new APIError(403, 'Admin access required')
  return grantMembershipDays(createSupabaseDirectClient(), {
    userId,
    tier,
    durationMs: days * DAY_MS,
    source: 'admin',
    sourceId: randomUUID(),
    note,
  })
}
