import { APIError, type APIHandler } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'
import { convertContract } from 'common/supabase/contracts'

export const unlistAndCancelUserContracts: APIHandler<
  'unlist-and-cancel-user-contracts'
> = async ({ userId }, auth) => {
  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'Only admins and mods can perform this action.')
  }

  await throwErrorIfNotMod(auth.uid)

  const resolver = await getUser(auth.uid)
  if (!resolver) {
    throw new APIError(500, 'Resolver not found')
  }
  const creator = await getUser(userId)
  if (!creator) {
    throw new APIError(500, 'Creator not found')
  }

  const pg = createSupabaseDirectClient()

  const contracts = await pg.map(
    `SELECT * FROM contracts WHERE creator_id = $1`,
    [userId],
    convertContract
  )

  if (contracts.length === 0) {
    console.log('No contracts found for this user.')
    return
  }

  if (contracts.length > 5) {
    throw new APIError(
      400,
      `This user has ${contracts.length} markets. You can only super ban users with 5 or less.`
    )
  }

  for (const contract of contracts) {
    await updateContract(pg, contract.id, {
      visibility: 'unlisted',
    })
  }

  try {
    for (const contract of contracts) {
      await resolveMarketHelper(contract, resolver, creator, {
        outcome: 'CANCEL',
      })
    }
  } catch (error) {
    console.error('Error resolving contracts:', error)
    throw new APIError(500, 'Failed to update one or more contracts.')
  }
}
