import type { ValidatedAPIParams } from 'common/api/schema'
import { APIError } from 'common/api/utils'
import { ENV } from 'common/envs/constants'
import { getMnxCreatorId } from 'common/perps/creator-accounts'
import { getMnxInstrument } from 'common/perps/mnx'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { addPerpPoolSubsidy } from './engine'
import { requirePerpManager } from './management-auth'

export const addManagedPerpSubsidy = async (
  body: ValidatedAPIParams<'add-perp-subsidy'>,
  managerId: string
) => {
  if (
    body.expectedManagerId !== undefined &&
    body.expectedManagerId !== managerId
  )
    throw new APIError(
      409,
      'The signed-in account changed. Sign back in before retrying.'
    )
  await requirePerpManager(createSupabaseDirectClient(), managerId)
  const funderId =
    body.fundingAccount === 'mnx' ? getMnxCreatorId(ENV) : managerId
  if (!funderId) throw new APIError(403, 'The MNX account is not configured.')

  const result = await addPerpPoolSubsidy(
    body.contractId,
    funderId,
    body.side,
    body.amount,
    {
      idempotencyKey: body.idempotencyKey,
      authorize: async (tx, contract) => {
        await requirePerpManager(tx, managerId, contract)
        if (body.fundingAccount === 'mnx') {
          // Even admins may only spend MNX funds on its own registered feeds.
          if (
            contract.creatorId !== funderId ||
            !getMnxInstrument(contract.oracleFeedId)
          )
            throw new APIError(
              403,
              'MNX funds can only be added to MNX-owned MNX markets.'
            )
          await requirePerpManager(tx, funderId, contract)
        }
      },
    }
  )
  return { ...result, funderId }
}
