import { APIError, APIHandler } from './helpers/endpoint'
import { readMembershipGrantView } from 'shared/membership-grants'
import { runTransactionWithRetries } from 'shared/transact-with-retries'

export const getMembershipGrants: APIHandler<'get-membership-grants'> = async (
  { userId },
  auth
) => {
  if (userId && userId !== auth.uid)
    throw new APIError(403, 'You can only view your own membership grants')
  const view = await runTransactionWithRetries((tx) =>
    readMembershipGrantView(tx, auth.uid, Date.now())
  )
  return { userId: auth.uid, ...view }
}
