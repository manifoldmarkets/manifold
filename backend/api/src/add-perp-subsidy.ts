import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { addPerpPoolSubsidy } from 'shared/perps/engine'
import { log } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { APIHandler } from './helpers/endpoint'

// Admin-only escrow top-up of one side's backing pool on a live perp. The
// admin pays from their own balance; all state checks (unresolved, MANA
// token, escrow invariant) and locking live in the engine.
export const addPerpSubsidy: APIHandler<'add-perp-subsidy'> = async (
  body,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)
  const { contractId, side, amount } = body

  const { contract, poolLong, poolShort } = await addPerpPoolSubsidy(
    contractId,
    auth.uid,
    side,
    amount
  )
  log(
    `admin ${auth.uid} added M$${amount} ${side} pool subsidy on ${contract.slug}: L=${poolLong} S=${poolShort}`
  )
  broadcastUpdatedContract(contract.visibility, {
    id: contractId,
    poolLong,
    poolShort,
  })

  return { success: true as const, poolLong, poolShort }
}
