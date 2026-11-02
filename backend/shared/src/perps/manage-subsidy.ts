import type { ValidatedAPIParams } from 'common/api/schema'
import { APIError } from 'common/api/utils'
import { ENV } from 'common/envs/constants'
import { getMnxCreatorId } from 'common/perps/creator-accounts'
import { getMnxInstrument } from 'common/perps/mnx'
import { convertUser } from 'common/supabase/users'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { getContract } from 'shared/utils'
import { getPerpCreatorAccountIds } from './creator-accounts'
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
  const pg = createSupabaseDirectClient()
  await requirePerpManager(pg, managerId)
  const funderId = await getFunderId(pg, body, managerId)
  if (!funderId) throw new APIError(403, 'The MNX account is not configured.')
  const spendsMnx =
    body.fundingAccount === 'mnx' ||
    (body.fundingAccount === 'creator' && funderId === getMnxCreatorId(ENV))

  const result = await addPerpPoolSubsidy(
    body.contractId,
    funderId,
    body.side,
    body.amount,
    {
      idempotencyKey: body.idempotencyKey,
      authorize: async (tx, contract) => {
        await requirePerpManager(tx, managerId, contract)
        // Backing paid by a creator returns to that creator at settlement,
        // so its funds may only go to its own markets.
        if (
          body.fundingAccount === 'creator' &&
          (contract.creatorId !== funderId ||
            !getPerpCreatorAccountIds(ENV).includes(funderId))
        )
          throw new APIError(
            403,
            "Creator funds can only be added to that perp creator account's own markets."
          )
        if (spendsMnx) {
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
        } else if (body.fundingAccount === 'creator')
          await requireActiveFunder(tx, funderId)
      },
    }
  )
  return { ...result, funderId }
}

const getFunderId = async (
  pg: SupabaseDirectClient,
  body: ValidatedAPIParams<'add-perp-subsidy'>,
  managerId: string
) => {
  if (body.fundingAccount === 'mnx') return getMnxCreatorId(ENV)
  if (body.fundingAccount !== 'creator') return managerId
  // Read before the lock to name the payer; authorize re-checks it under the
  // lock. A market's creator never changes.
  const contract = await getContract(pg, body.contractId)
  if (!contract)
    throw new APIError(404, `Contract ${body.contractId} not found`)
  return contract.creatorId
}

const requireActiveFunder = async (tx: SupabaseTransaction, id: string) => {
  const funder = await tx.oneOrNone(
    'select * from users where id = $1',
    [id],
    convertUser
  )
  if (!funder || funder.userDeleted || funder.isBannedFromPosting)
    throw new APIError(
      403,
      'The creator account must be active and unbanned to fund backing.'
    )
}
