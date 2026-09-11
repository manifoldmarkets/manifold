import { APIError } from 'common/api/utils'
import type { PerpContract } from 'common/contract'
import { ENV, isAdminId } from 'common/envs/constants'
import { getMnxInstrument } from 'common/perps/mnx'
import { convertUser } from 'common/supabase/users'
import type { SupabaseDirectClient } from 'shared/supabase/init'
import { getMnxCreatorId } from './creator-accounts'

// Identity is pinned by environment, never inferred from a username or badge.
export const isPerpManager = (userId: string, contract?: PerpContract) =>
  isAdminId(userId) ||
  (userId === getMnxCreatorId(ENV) &&
    (!contract ||
      (contract.creatorId === userId &&
        !!getMnxInstrument(contract.oracleFeedId))))

export const requirePerpManager = async (
  pg: Pick<SupabaseDirectClient, 'oneOrNone'>,
  userId: string,
  contract?: PerpContract
) => {
  if (!isPerpManager(userId, contract))
    throw new APIError(
      403,
      'Only admins and the MNX account managing its own MNX markets may do this.'
    )
  const user = await pg.oneOrNone(
    'select * from users where id = $1',
    [userId],
    convertUser
  )
  if (!user || user.userDeleted || user.isBannedFromPosting)
    throw new APIError(403, 'An active, unbanned manager account is required.')
  return user
}
