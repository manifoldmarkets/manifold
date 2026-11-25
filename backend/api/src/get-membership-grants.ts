import { APIError, APIHandler } from './helpers/endpoint'
import {
  advanceGrants,
  grantRetryOptions,
  hasDueMembershipGrant,
  readMembershipGrantView,
  runQueuedGrantTransition,
} from 'shared/membership-grants'
import { runTransactionWithRetries } from 'shared/transact-with-retries'

export const getMembershipGrants: APIHandler<'get-membership-grants'> = async (
  { userId },
  auth
) => {
  if (userId && userId !== auth.uid)
    throw new APIError(403, 'You can only view your own membership grants')
  const view = await runTransactionWithRetries(async (tx) => {
    const now = Date.now()
    return (await hasDueMembershipGrant(tx, auth.uid, now))
      ? null
      : readMembershipGrantView(tx, auth.uid, now)
  })
  if (view) return { userId: auth.uid, ...view }

  return runQueuedGrantTransition(auth.uid, () =>
    runTransactionWithRetries(
      async (tx) => {
        const now = Date.now()
        // Another checkout may have settled the grant while we waited.
        const change = (await hasDueMembershipGrant(tx, auth.uid, now))
          ? await advanceGrants(tx, auth.uid, now)
          : null
        const view = await readMembershipGrantView(tx, auth.uid, now)
        return { change, result: { userId: auth.uid, ...view } }
      },
      3,
      grantRetryOptions
    )
  )
}
