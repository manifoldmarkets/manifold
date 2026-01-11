import { createBountyAddedNotification } from 'shared/create-notification'
import { runAddBountyTxn } from 'shared/txn/run-bounty-txn'
import { getContract, getUser } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getActiveUserBans } from './helpers/rate-limit'
import { isUserBanned } from 'common/ban-utils'

export const addBounty: APIHandler<'market/:contractId/add-bounty'> = async (
  props,
  auth
) => {
  const { contractId, amount } = props

  // Check for trading ban (bounties involve mana transfer)
  const pg = createSupabaseDirectClient()
  const user = await getUser(auth.uid, pg)
  if (!user) throw new APIError(404, 'User not found')
  const userBans = await getActiveUserBans(auth.uid)
  if (isUserBanned(userBans, 'trading')) {
    throw new APIError(403, 'You are banned from trading')
  }

  const txn = await runAddBountyTxn({
    fromId: auth.uid,
    fromType: 'USER',
    toId: contractId,
    toType: 'CONTRACT',
    amount,
    token: 'M$',
    category: 'BOUNTY_ADDED',
  })

  const contract = await getContract(pg, contractId)
  if (contract && contract.creatorId !== auth.uid) {
    await createBountyAddedNotification(
      contract.creatorId,
      contract,
      auth.uid,
      amount
    )
  }

  return txn
}
