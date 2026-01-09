import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getContract } from 'shared/utils'
import { calculateMarketLoanMax } from 'common/loans'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'
import { APIError } from './helpers/endpoint'

export const getMarketLoanMax: APIHandler<'get-market-loan-max'> = async (
  props,
  auth
) => {
  const { contractId } = props
  const pg = createSupabaseDirectClient()

  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, `User ${auth.uid} not found`)
  }

  const contract = await getContract(pg, contractId)
  if (!contract) {
    throw new APIError(404, `Contract ${contractId} not found`)
  }

  if (!('mechanism' in contract)) {
    throw new APIError(400, 'Contract must be a market contract')
  }

  // Get user's metric for this contract and calculate net worth
  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  const contractsById = keyBy(contracts, 'id')
  const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
  const netWorth = user.balance + value

  const metric = metrics.find((m) => m.contractId === contractId)

  const currentLoan = metric?.loan ?? 0
  const maxLoan = calculateMarketLoanMax(netWorth)
  const available = Math.max(0, maxLoan - currentLoan)

  return {
    maxLoan,
    currentLoan,
    available,
    isLiquid: false, // No longer used, but keeping for API compatibility
  }
}
