import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import {
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  calculateMarketLoanMax,
  distributeLoanProportionally,
  isUserEligibleForGeneralLoan,
  isUserEligibleForMarketLoan,
  isMarketEligibleForLoan,
  getMidnightPacific,
  MS_PER_DAY,
} from 'common/loans'
import { LoanTxn } from 'common/txn'
import { txnToRow } from 'shared/txn/run-txn'
import { filterDefined } from 'common/util/array'
import { ContractMetric } from 'common/contract-metric'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { getInsertQuery } from 'shared/supabase/utils'
import {
  broadcastUserUpdates,
  bulkIncrementBalancesQuery,
  UserUpdate,
} from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  getLoanTrackingRows,
  upsertLoanTrackingQuery,
  LoanTrackingRow,
} from 'shared/helpers/user-contract-loans'
import { bulkUpdateContractMetricsQuery } from 'shared/helpers/user-contract-metrics'
import { getContract } from 'shared/utils'

export const requestLoan: APIHandler<'request-loan'> = async (props, auth) => {
  const { amount, contractId, answerId } = props
  const pg = createSupabaseDirectClient()

  // Check if loans are globally enabled
  const loanStatus = await pg.oneOrNone<{ status: boolean }>(
    `SELECT status FROM system_trading_status WHERE token = 'LOAN'`
  )
  if (loanStatus && !loanStatus.status) {
    throw new APIError(
      503,
      'Loans are currently disabled. Please try again later.'
    )
  }

  if (amount <= 0) {
    throw new APIError(400, 'Loan amount must be positive')
  }

  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, `User ${auth.uid} not found`)
  }

  const portfolioMetric = await pg.oneOrNone(
    `select *
     from user_portfolio_history_latest
     where user_id = $1`,
    [auth.uid],
    convertPortfolioHistory
  )
  if (!portfolioMetric) {
    throw new APIError(404, `No portfolio found for user ${auth.uid}`)
  }

  const now = Date.now()

  // Market-specific loan
  if (contractId) {
    const contract = await getContract(pg, contractId)
    if (!contract) {
      throw new APIError(404, `Contract ${contractId} not found`)
    }

    if (contract.isResolved || contract.token !== 'MANA') {
      throw new APIError(400, 'Can only take loans on unresolved MANA markets')
    }

    // Type guard - ensure it's a MarketContract
    if (!('mechanism' in contract)) {
      throw new APIError(400, 'Contract must be a market contract')
    }

    // Check market eligibility for new loans
    const eligibility = isMarketEligibleForLoan({
      visibility: contract.visibility,
      isRanked: contract.isRanked,
      uniqueBettorCount: contract.uniqueBettorCount,
      createdTime: contract.createdTime,
    })
    if (!eligibility.eligible) {
      throw new APIError(
        400,
        `Market is not eligible for loans: ${eligibility.reason}`
      )
    }

    // Get user's metrics for this contract and calculate net worth
    const { metrics, contracts } =
      await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
    const contractsById = keyBy(contracts, 'id')
    const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
    const netWorth = user.balance + value

    // Sum loans and position values across ALL answers for this contract (per-market limit)
    const contractMetrics = metrics.filter((m) => m.contractId === contractId)
    if (contractMetrics.length === 0) {
      throw new APIError(
        400,
        'You must have a position in this market to take a loan'
      )
    }

    // Calculate total loan (free + margin) for limit checking
    const totalMarketLoan = contractMetrics.reduce(
      (sum, m) => sum + (m.loan ?? 0) + (m.marginLoan ?? 0),
      0
    )
    const totalPositionValue = contractMetrics.reduce(
      (sum, m) => sum + (m.payout ?? 0),
      0
    )

    // Check loan limits
    if (
      !isUserEligibleForMarketLoan(
        totalMarketLoan,
        amount,
        netWorth,
        totalPositionValue
      )
    ) {
      const maxLoan = calculateMarketLoanMax(netWorth, totalPositionValue)
      throw new APIError(
        400,
        `Loan amount exceeds maximum. Max loan for this market: ${maxLoan.toFixed(
          2
        )}, current total loan: ${totalMarketLoan.toFixed(2)}`
      )
    }

    // Check aggregate loan limit across ALL markets
    const currentTotalLoan = portfolioMetric.loanTotal ?? 0
    const maxAggregateLoan = calculateMaxGeneralLoanAmount(netWorth)
    if (currentTotalLoan + amount > maxAggregateLoan) {
      const availableAggregate = Math.max(
        0,
        maxAggregateLoan - currentTotalLoan
      )
      throw new APIError(
        400,
        `Loan would exceed your total borrowing limit. Max total loan: ${maxAggregateLoan.toFixed(
          2
        )}, current total: ${currentTotalLoan.toFixed(
          2
        )}, available: ${availableAggregate.toFixed(2)}`
      )
    }

    // Check daily loan limit (10% of net worth per day, resets at midnight PT)
    const dailyLimit = calculateDailyLoanLimit(netWorth)
    const midnightPT = getMidnightPacific()
    const todayLoansResult = await pg.oneOrNone<{ total: number }>(
      `select coalesce(sum(amount), 0) as total
       from txns
       where to_id = $1
       and category IN ('LOAN', 'DAILY_FREE_LOAN')
       and created_time >= $2`,
      [user.id, midnightPT.toISOString()]
    )
    const todayLoans = todayLoansResult?.total ?? 0

    if (todayLoans + amount > dailyLimit) {
      const availableToday = Math.max(0, dailyLimit - todayLoans)
      throw new APIError(
        400,
        `Daily loan limit exceeded. You can borrow up to ${dailyLimit.toFixed(
          2
        )} per day (10% of net worth, resets at midnight PT). You've already borrowed ${todayLoans.toFixed(
          2
        )} today. Available today: ${availableToday.toFixed(2)}`
      )
    }

    // Get existing loan tracking for this contract
    const existingLoanTracking = await getLoanTrackingRows(pg, user.id, [
      contractId,
    ])
    const trackingByKey = keyBy(
      existingLoanTracking,
      (t) => `${t.contract_id}-${t.answer_id ?? ''}`
    )

    // Determine if this is a multi-choice market
    const isMultiChoice = contract.mechanism === 'cpmm-multi-1'

    // If answerId is provided OR it's not a multi-choice market, apply to single metric
    if (answerId || !isMultiChoice) {
      const metric = metrics.find(
        (m) =>
          m.contractId === contractId &&
          (answerId ? m.answerId === answerId : m.answerId === null)
      )

      if (!metric) {
        throw new APIError(
          400,
          'You must have a position in this market to take a loan'
        )
      }

      // Add loan to this specific answer's metric (margin loan with interest)
      const currentAnswerMarginLoan = metric.marginLoan ?? 0
      const updatedMetric = {
        ...metric,
        marginLoan: currentAnswerMarginLoan + amount,
      }

      const key = `${contractId}-${answerId ?? ''}`
      const tracking = trackingByKey[key]

      // Interest tracking is based on marginLoan
      const oldLoan = currentAnswerMarginLoan
      const lastUpdate = tracking?.last_loan_update_time ?? now
      const daysSinceLastUpdate = (now - lastUpdate) / MS_PER_DAY
      const newIntegral =
        (tracking?.loan_day_integral ?? 0) + oldLoan * daysSinceLastUpdate

      const loanTrackingUpdate: Omit<LoanTrackingRow, 'id'> = {
        user_id: user.id,
        contract_id: contractId,
        answer_id: answerId ?? null,
        loan_day_integral: newIntegral,
        last_loan_update_time: now,
      }

      const bulkUpdateContractMetricsQ = bulkUpdateContractMetricsQuery([
        updatedMetric,
      ])
      const loanTrackingQ = upsertLoanTrackingQuery([loanTrackingUpdate])
      const { txnQuery, balanceUpdateQuery } = payUserLoan(user.id, amount)

      const { userUpdates } = await betsQueue.enqueueFn(async () => {
        return pg.tx(async (tx) => {
          const res = await tx.multi(
            `${balanceUpdateQuery};
             ${txnQuery};
             ${bulkUpdateContractMetricsQ};
             ${loanTrackingQ}`
          )
          const userUpdates = res[0] as UserUpdate[]
          return { userUpdates }
        })
      }, [auth.uid])

      broadcastUserUpdates(userUpdates)

      log(
        `User ${
          user.id
        } took market-specific loan of ${amount} on contract ${contractId}${
          answerId ? ` answer ${answerId}` : ''
        }`
      )

      return {
        success: true,
        amount,
        distributed: [
          {
            contractId,
            answerId: answerId ?? null,
            loanAmount: amount,
          },
        ],
      }
    }

    // Multi-choice market without answerId: distribute proportionally across all answers
    const metricsWithInvestment = contractMetrics.filter(
      (m) => (m.invested ?? 0) > 0 && m.answerId !== null
    )

    if (metricsWithInvestment.length === 0) {
      throw new APIError(
        400,
        'You must have a position in this market to take a loan'
      )
    }

    // Distribute loan proportionally based on invested amount
    const totalInvestment = metricsWithInvestment.reduce(
      (sum, m) => sum + (m.invested ?? 0),
      0
    )

    const distributions: {
      contractId: string
      answerId: string | null
      loanAmount: number
    }[] = []
    const updatedMetrics: ContractMetric[] = []
    const loanTrackingUpdates: Omit<LoanTrackingRow, 'id'>[] = []

    for (const metric of metricsWithInvestment) {
      const investment = metric.invested ?? 0
      const proportion = investment / totalInvestment
      const loanForAnswer = amount * proportion

      if (loanForAnswer > 0) {
        distributions.push({
          contractId,
          answerId: metric.answerId,
          loanAmount: loanForAnswer,
        })

        // Add to marginLoan (interest-bearing)
        updatedMetrics.push({
          ...metric,
          marginLoan: (metric.marginLoan ?? 0) + loanForAnswer,
        })

        const key = `${contractId}-${metric.answerId ?? ''}`
        const tracking = trackingByKey[key]
        // Interest tracking is based on marginLoan
        const oldLoan = metric.marginLoan ?? 0
        const lastUpdate = tracking?.last_loan_update_time ?? now
        const daysSinceLastUpdate = (now - lastUpdate) / MS_PER_DAY
        const newIntegral =
          (tracking?.loan_day_integral ?? 0) + oldLoan * daysSinceLastUpdate

        loanTrackingUpdates.push({
          user_id: user.id,
          contract_id: contractId,
          answer_id: metric.answerId,
          loan_day_integral: newIntegral,
          last_loan_update_time: now,
        })
      }
    }

    const bulkUpdateContractMetricsQ =
      bulkUpdateContractMetricsQuery(updatedMetrics)
    const loanTrackingQ = upsertLoanTrackingQuery(loanTrackingUpdates)
    const { txnQuery, balanceUpdateQuery } = payUserLoan(user.id, amount)

    const { userUpdates } = await betsQueue.enqueueFn(async () => {
      return pg.tx(async (tx) => {
        const res = await tx.multi(
          `${balanceUpdateQuery};
           ${txnQuery};
           ${bulkUpdateContractMetricsQ};
           ${loanTrackingQ}`
        )
        const userUpdates = res[0] as UserUpdate[]
        return { userUpdates }
      })
    }, [auth.uid])

    broadcastUserUpdates(userUpdates)

    log(
      `User ${user.id} took market-specific loan of ${amount} on multi-choice contract ${contractId}, distributed across ${distributions.length} answers`
    )

    return {
      success: true,
      amount,
      distributed: distributions,
    }
  }

  // General loan - distribute proportionally across all markets
  const { contracts, metrics } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  const contractsById = keyBy(contracts, 'id')
  const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
  const netWorth = user.balance + value

  // Check total loan limit
  if (!isUserEligibleForGeneralLoan(portfolioMetric, netWorth, amount)) {
    const maxLoan = calculateMaxGeneralLoanAmount(netWorth)
    const currentLoan = portfolioMetric.loanTotal ?? 0
    throw new APIError(
      400,
      `Loan amount exceeds maximum. Max loan: ${maxLoan.toFixed(
        2
      )}, current loan: ${currentLoan.toFixed(2)}, available: ${(
        maxLoan - currentLoan
      ).toFixed(2)}`
    )
  }

  // Check daily loan limit (10% of net worth per day, resets at midnight PT)
  const dailyLimit = calculateDailyLoanLimit(netWorth)
  const midnightPT = getMidnightPacific()
  const todayLoansResult = await pg.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category IN ('LOAN', 'DAILY_FREE_LOAN')
     and created_time >= $2`,
    [user.id, midnightPT.toISOString()]
  )
  const todayLoans = todayLoansResult?.total ?? 0

  if (todayLoans + amount > dailyLimit) {
    const availableToday = Math.max(0, dailyLimit - todayLoans)
    throw new APIError(
      400,
      `Daily loan limit exceeded. You can borrow up to ${dailyLimit.toFixed(
        2
      )} per day (resets at midnight PT). You've already borrowed ${todayLoans.toFixed(
        2
      )} today. Available today: ${availableToday.toFixed(2)}`
    )
  }

  // Filter to only unresolved MANA markets that meet eligibility criteria
  const unresolvedManaMetrics = metrics.filter((m) => {
    const contract = contractsById[m.contractId]
    if (!contract || contract.isResolved || contract.token !== 'MANA') {
      return false
    }
    // Apply market eligibility criteria for new loans
    return isMarketEligibleForLoan({
      visibility: contract.visibility,
      isRanked: contract.isRanked,
      uniqueBettorCount: contract.uniqueBettorCount,
      createdTime: contract.createdTime,
    }).eligible
  })

  if (unresolvedManaMetrics.length === 0) {
    throw new APIError(
      400,
      'No eligible markets to distribute loan across. Markets must be listed, ranked, have >10 traders, and be at least 24 hours old.'
    )
  }

  // Distribute loan proportionally
  const distributions = distributeLoanProportionally(
    amount,
    unresolvedManaMetrics
  )

  if (distributions.length === 0) {
    throw new APIError(
      400,
      'No markets with investment to distribute loan across'
    )
  }

  // Build updated metrics (add to marginLoan for interest-bearing loans)
  const metricsById = keyBy(
    metrics,
    (m) => `${m.contractId}-${m.answerId ?? ''}`
  )
  const updatedMetrics = filterDefined(
    distributions.map((dist) => {
      const key = `${dist.contractId}-${dist.answerId ?? ''}`
      const metric = metricsById[key]
      if (!metric) return undefined

      return {
        ...metric,
        marginLoan: (metric.marginLoan ?? 0) + dist.loanAmount,
      }
    })
  )

  // Get existing loan tracking data
  const contractIds = [...new Set(distributions.map((d) => d.contractId))]
  const existingLoanTracking = await getLoanTrackingRows(
    pg,
    user.id,
    contractIds
  )
  const trackingByKey = keyBy(
    existingLoanTracking,
    (t) => `${t.contract_id}-${t.answer_id ?? ''}`
  )

  // Build loan tracking updates (only tracks marginLoan for interest)
  const loanTrackingUpdates: Omit<LoanTrackingRow, 'id'>[] = []
  for (const dist of distributions) {
    const key = `${dist.contractId}-${dist.answerId ?? ''}`
    const tracking = trackingByKey[key]
    const metric = metricsById[key]
    // Interest tracking is based on marginLoan
    const oldLoan = metric?.marginLoan ?? 0
    const lastUpdate = tracking?.last_loan_update_time ?? now
    const daysSinceLastUpdate = (now - lastUpdate) / MS_PER_DAY
    const newIntegral =
      (tracking?.loan_day_integral ?? 0) + oldLoan * daysSinceLastUpdate

    loanTrackingUpdates.push({
      user_id: user.id,
      contract_id: dist.contractId,
      answer_id: dist.answerId,
      loan_day_integral: newIntegral,
      last_loan_update_time: now,
    })
  }

  const bulkUpdateContractMetricsQ =
    bulkUpdateContractMetricsQuery(updatedMetrics)
  const loanTrackingQ = upsertLoanTrackingQuery(loanTrackingUpdates)
  const { txnQuery, balanceUpdateQuery } = payUserLoan(user.id, amount)

  const { userUpdates } = await betsQueue.enqueueFn(async () => {
    return pg.tx(async (tx) => {
      const res = await tx.multi(
        `${balanceUpdateQuery};
         ${txnQuery};
         ${bulkUpdateContractMetricsQ};
         ${loanTrackingQ}`
      )
      const userUpdates = res[0] as UserUpdate[]
      return { userUpdates }
    })
  }, [auth.uid])

  broadcastUserUpdates(userUpdates)
  log(`User ${user.id} took general loan of ${amount}`)

  return {
    success: true,
    amount,
    distributed: distributions,
  }
}

const payUserLoan = (userId: string, payout: number) => {
  const loanTxn: Omit<LoanTxn, 'id' | 'createdTime'> = {
    fromId: 'BANK',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: payout,
    token: 'M$',
    category: 'LOAN',
    data: {
      // Distinguishes correct loans from erroneous old loans that were marked as deposits instead of profit.
      countsAsProfit: true,
    },
  }
  const balanceUpdate = {
    id: loanTxn.toId,
    balance: payout,
  }
  const balanceUpdateQuery = bulkIncrementBalancesQuery([balanceUpdate])
  const txnQuery = getInsertQuery('txns', txnToRow(loanTxn))
  return {
    txnQuery,
    balanceUpdateQuery,
  }
}
