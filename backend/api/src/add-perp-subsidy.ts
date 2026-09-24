import { addManagedPerpSubsidy } from 'shared/perps/manage-subsidy'
import { log } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { APIHandler } from './helpers/endpoint'

// Funding and authorization are checked together under the engine's contract lock.
export const addPerpSubsidy: APIHandler<'add-perp-subsidy'> = async (
  body,
  auth
) => {
  const { contractId, side, amount } = body

  const { contract, poolLong, poolShort, replayed, funderId } =
    await addManagedPerpSubsidy(body, auth.uid)
  if (!replayed)
    log(
      `perp manager ${auth.uid} added M$${
        amount * (side === 'both' ? 2 : 1)
      } from ${funderId} to ${side} pools on ${
        contract.slug
      }: L=${poolLong} S=${poolShort}`
    )
  broadcastUpdatedContract(contract.visibility, {
    id: contractId,
    poolLong,
    poolShort,
  })

  return { success: true as const, poolLong, poolShort }
}
