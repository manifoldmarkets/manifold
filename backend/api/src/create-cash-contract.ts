import { APIError, type APIHandler } from './helpers/endpoint'
import { isAdminId } from 'common/envs/constants'
import { createCashContractMain } from 'shared/create-cash-contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { toLiteMarket } from 'common/api/market-types'

export const createCashContract: APIHandler<'create-cash-contract'> = async (
  props,
  auth
) => {
  const { manaContractId, subsidyAmount } = props

  if (!isAdminId(auth.uid))
    throw new APIError(
      403,
      'Only Manifold team members can create cash contracts'
    )

  const pg = createSupabaseDirectClient()

  const contract = await createCashContractMain(
    pg,
    manaContractId,
    subsidyAmount
  )
  return toLiteMarket(contract)
}
