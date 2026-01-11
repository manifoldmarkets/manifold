import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract } from 'shared/utils'
import { calculateInterestShares } from 'shared/calculate-interest-shares'

export const getClaimableInterest: APIHandler<'get-claimable-interest'> = async (
  props,
  auth
) => {
  const { contractId, answerId } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  const contract = await getContract(pg, contractId)
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  // Calculate claimable interest shares
  const interestResult = await calculateInterestShares(
    pg,
    contractId,
    userId,
    answerId,
    Date.now(),
    contract.token
  )

  return {
    yesShares: interestResult.yesShares,
    noShares: interestResult.noShares,
    yesShareDays: interestResult.yesShareDays,
    noShareDays: interestResult.noShareDays,
  }
}
