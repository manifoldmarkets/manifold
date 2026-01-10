import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getContract } from 'shared/utils'
import {
  calculateMarketLoanMax,
  MAX_MARKET_LOAN_NET_WORTH_PERCENT,
  MAX_MARKET_LOAN_POSITION_PERCENT,
} from 'common/loans'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy, sumBy } from 'lodash'
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

  // Get user's metrics for this contract and calculate net worth
  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  const contractsById = keyBy(contracts, 'id')
  const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
  const netWorth = user.balance + value

  // Sum loans across ALL answers for this contract (per-market limit)
  const contractMetrics = metrics.filter((m) => m.contractId === contractId)
  const currentLoan = sumBy(contractMetrics, (m) => m.loan ?? 0)
  const totalPositionValue = sumBy(contractMetrics, (m) => m.payout ?? 0)

  // Calculate both limits
  const netWorthLimit = netWorth * MAX_MARKET_LOAN_NET_WORTH_PERCENT
  const positionLimit = totalPositionValue * MAX_MARKET_LOAN_POSITION_PERCENT
  const maxLoan = calculateMarketLoanMax(netWorth, totalPositionValue)
  const available = Math.max(0, maxLoan - currentLoan)

  return {
    maxLoan,
    currentLoan,
    available,
    netWorthLimit,
    positionLimit,
    totalPositionValue,
  }
}
