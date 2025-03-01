import { z } from 'zod'
import { contractPath } from 'common/contract'
import { getContract, log, revalidateStaticProps } from 'shared/utils'
import { isAdminId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateContract } from 'shared/supabase/contracts'

const bodySchema = z
  .object({
    contractId: z.string(),
  })
  .strict()

export const deleteMarket = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()
  const { contractId } = validate(bodySchema, req.body)
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found')
  const { creatorId } = contract

  if (creatorId !== auth.uid && !isAdminId(auth.uid))
    throw new APIError(403, 'User is not creator of contract')

  const { resolution, uniqueBettorCount, siblingContractId } = contract

  if (contract.token === 'CASH')
    throw new APIError(
      403,
      `Can't delete cash market directly. Delete the sibling mana contract ${siblingContractId} to delete this market.`
    )

  if (resolution !== 'CANCEL')
    throw new APIError(403, 'Contract must be resolved N/A to be deleted')

  if (uniqueBettorCount && uniqueBettorCount >= 2)
    throw new APIError(
      403,
      'Contract must have less than 2 bettors to be deleted'
    )

  // duplicate checks for sibling contract
  if (siblingContractId) {
    if (!isAdminId(auth.uid))
      throw new APIError(403, 'Only Manifold admins can delete cash markets')

    const cashContract = await getContract(pg, siblingContractId)
    if (!cashContract)
      throw new APIError(404, 'Sibling cash contract not found')

    if (cashContract.resolution !== 'CANCEL')
      throw new APIError(
        403,
        'Sibling contract must be resolved N/A to be deleted'
      )

    if (cashContract.uniqueBettorCount && cashContract.uniqueBettorCount >= 2)
      throw new APIError(
        403,
        'Sibling contract must have less than 2 bettors to be deleted'
      )

    // cash contract gets auto deleted via db trigger
  }

  await updateContract(pg, contractId, { deleted: true })
  await revalidateStaticProps(contractPath(contract))

  log('contract ' + contractId + ' deleted')

  return { status: 'success' }
})
