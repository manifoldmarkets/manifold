import { requirePerpManager } from 'shared/perps/management-auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { addPerpPoolSubsidy } from 'shared/perps/engine'
import { log } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { APIError, APIHandler } from './helpers/endpoint'

// The signed-in manager pays from their own balance; all state checks (unresolved, MANA
// token, escrow invariant) and locking live in the engine.
export const addPerpSubsidy: APIHandler<'add-perp-subsidy'> = async (
  body,
  auth
) => {
  if (
    body.expectedManagerId !== undefined &&
    body.expectedManagerId !== auth.uid
  )
    throw new APIError(
      409,
      'The paying account changed. Sign back in before retrying.'
    )
  await requirePerpManager(createSupabaseDirectClient(), auth.uid)
  const { contractId, side, amount } = body

  const { contract, poolLong, poolShort, replayed } = await addPerpPoolSubsidy(
    contractId,
    auth.uid,
    side,
    amount,
    {
      idempotencyKey: body.idempotencyKey,
      authorize: async (tx, contract) => {
        await requirePerpManager(tx, auth.uid, contract)
      },
    }
  )
  if (!replayed)
    log(
      `perp manager ${auth.uid} added M$${
        amount * (side === 'both' ? 2 : 1)
      } to ${side} pools on ${contract.slug}: L=${poolLong} S=${poolShort}`
    )
  broadcastUpdatedContract(contract.visibility, {
    id: contractId,
    poolLong,
    poolShort,
  })

  return { success: true as const, poolLong, poolShort }
}
