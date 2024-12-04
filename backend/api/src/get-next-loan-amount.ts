import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import { getUnresolvedContractMetricsContractsAnswers } from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'

export const getNextLoanAmount: APIHandler<'get-next-loan-amount'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()

  const portfolioMetric = await pg.oneOrNone(
    `select user_id, ts, investment_value, balance, total_deposits
     from user_portfolio_history_latest
     where user_id = $1`,
    [auth.uid],
    (r) =>
      ({
        userId: r.user_id as string,
        timestamp: Date.parse(r.ts as string),
        investmentValue: parseFloat(r.investment_value as string),
        balance: parseFloat(r.balance as string),
        totalDeposits: parseFloat(r.total_deposits as string),
      } as PortfolioMetrics & { userId: string })
  )
  if (!portfolioMetric) {
    return { amount: 0 }
  }
  log(`Loaded portfolio.`)

  if (!isUserEligibleForLoan(portfolioMetric)) {
    return { amount: 0 }
  }

  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, `User ${auth.uid} not found`)
  }
  log(`Loaded user ${user.id}`)

  const { contracts, metricsByContract } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  log(`Loaded ${contracts.length} contracts.`)

  const contractsById = keyBy(contracts, 'id')

  const result = getUserLoanUpdates(metricsByContract, contractsById)
  return { amount: result.payout }
}
