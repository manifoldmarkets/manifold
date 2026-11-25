import { APIError, APIHandler } from './helpers/endpoint'
import {
  endDueMembershipGrant,
  grantRetryOptions,
  publishGrantTransition,
  readMembershipGrantView,
} from 'shared/membership-grants'
import { runTransactionWithRetries } from 'shared/transact-with-retries'

export const getMembershipGrants: APIHandler<'get-membership-grants'> = async (
  { userId },
  auth
) => {
  if (userId && userId !== auth.uid)
    throw new APIError(403, 'You can only view your own membership grants')
  const { change, view } = await runTransactionWithRetries(
    async (tx) => {
      const now = Date.now()
      const change = await endDueMembershipGrant(tx, auth.uid, now)
      return { change, view: await readMembershipGrantView(tx, auth.uid, now) }
    },
    3,
    grantRetryOptions
  )
  if (change) await publishGrantTransition(auth.uid, change)
  return { userId: auth.uid, ...view }
}
