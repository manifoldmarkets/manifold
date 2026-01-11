import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import {
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  MS_PER_DAY,
} from 'common/loans'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'

export const getNextLoanAmount: APIHandler<'get-next-loan-amount'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()

  const portfolioMetric = await pg.oneOrNone(
    `select *
     from user_portfolio_history_latest
     where user_id = $1`,
    [userId],
    convertPortfolioHistory
  )
  if (!portfolioMetric) {
    return {
      maxGeneralLoan: 0,
      currentLoan: 0,
      available: 0,
      dailyLimit: 0,
      todayLoans: 0,
      availableToday: 0,
    }
  }

  const user = await getUser(userId)
  if (!user) {
    return {
      maxGeneralLoan: 0,
      currentLoan: 0,
      available: 0,
      dailyLimit: 0,
      todayLoans: 0,
      availableToday: 0,
    }
  }

  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [userId])
  const contractsById = keyBy(contracts, 'id')
  const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
  const netWorth = user.balance + value

  const maxGeneralLoan = calculateMaxGeneralLoanAmount(netWorth)
  const currentLoan = portfolioMetric.loanTotal ?? 0
  const available = Math.max(0, maxGeneralLoan - currentLoan)

  // Calculate daily limit and today's loans
  const dailyLimit = calculateDailyLoanLimit(netWorth)
  const oneDayAgo = Date.now() - MS_PER_DAY
  const todayLoansResult = await pg.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category = 'LOAN'
     and created_time >= $2`,
    [userId, new Date(oneDayAgo).toISOString()]
  )
  const todayLoans = todayLoansResult?.total ?? 0
  const availableToday = Math.max(0, dailyLimit - todayLoans)

  return {
    maxGeneralLoan,
    currentLoan,
    available,
    dailyLimit,
    todayLoans,
    availableToday,
  }
}
