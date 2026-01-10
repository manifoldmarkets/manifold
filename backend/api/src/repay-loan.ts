import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import {
  calculateLoanWithInterest,
  distributeRepaymentProportionally,
  LoanWithInterest,
  MS_PER_DAY,
} from 'common/loans'
import { Txn } from 'common/txn'
import { txnToRow } from 'shared/txn/run-txn'
import { filterDefined } from 'common/util/array'
import {
  getUnresolvedContractMetricsContractsAnswers,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'
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

export const repayLoan: APIHandler<'repay-loan'> = async (props, auth) => {
  const { amount, contractId, answerId } = props
  const pg = createSupabaseDirectClient()
  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, `User ${auth.uid} not found`)
  }

  if (amount <= 0) {
    throw new APIError(400, 'Repayment amount must be positive')
  }

  if (user.balance < amount) {
    throw new APIError(400, 'Insufficient balance')
  }

  const now = Date.now()

  // Get all user's contract metrics with loans
  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  
  // Market-specific repayment
  if (contractId) {
    const metric = metrics.find(
      (m) =>
        m.contractId === contractId &&
        (answerId ? m.answerId === answerId : m.answerId === null)
    )

    if (!metric || (metric.loan ?? 0) <= 0) {
      throw new APIError(400, 'No outstanding loan on this market')
    }

    // Get loan tracking data
    const loanTracking = await getLoanTrackingRows(pg, user.id, [contractId])
    const tracking = loanTracking.find(
      (t) => t.contract_id === contractId && (answerId ? t.answer_id === answerId : t.answer_id === null)
    )

    const loanWithInterest = calculateLoanWithInterest(metric, tracking, now)
    const totalOwed = loanWithInterest.total

    if (amount > totalOwed) {
      throw new APIError(400, `Can only repay up to ${totalOwed.toFixed(2)} on this market`)
    }

    const repaymentAmount = amount
    const principalRatio = loanWithInterest.principal / loanWithInterest.total
    const interestRatio = loanWithInterest.interest / loanWithInterest.total

    const principalRepaid = repaymentAmount * principalRatio
    const interestRepaid = repaymentAmount * interestRatio

    // Update metric
    const updatedMetric = {
      ...metric,
      loan: Math.max(0, (metric.loan ?? 0) - principalRepaid),
    }

    // Update loan tracking
    const loanTrackingUpdate: Omit<LoanTrackingRow, 'id'>[] = []
    if (tracking) {
      const daysSinceLastUpdate = (now - tracking.last_loan_update_time) / MS_PER_DAY
      const finalIntegral =
        tracking.loan_day_integral + loanWithInterest.principal * daysSinceLastUpdate
      const repaymentRatio = repaymentAmount / loanWithInterest.total
      const newIntegral = finalIntegral * (1 - repaymentRatio)

      loanTrackingUpdate.push({
        user_id: user.id,
        contract_id: contractId,
        answer_id: answerId ?? null,
        loan_day_integral: newIntegral,
        last_loan_update_time: now,
      })
    } else {
      loanTrackingUpdate.push({
        user_id: user.id,
        contract_id: contractId,
        answer_id: answerId ?? null,
        loan_day_integral: 0,
        last_loan_update_time: now,
      })
    }

    // Create transaction
    const loanPaymentTxn: Omit<Txn, 'id' | 'createdTime'> = {
      fromId: user.id,
      fromType: 'USER',
      toId: 'BANK',
      toType: 'BANK',
      amount: -repaymentAmount,
      token: 'M$',
      category: 'LOAN_PAYMENT',
      data: {
        amountRepaid: repaymentAmount,
      },
    }

    const balanceUpdate = {
      id: user.id,
      balance: -repaymentAmount,
    }

    const bulkUpdateContractMetricsQ =
      bulkUpdateContractMetricsQuery([updatedMetric])
    const loanTrackingQ = upsertLoanTrackingQuery(loanTrackingUpdate)
    const balanceUpdateQuery = bulkIncrementBalancesQuery([balanceUpdate])
    const txnQuery = getInsertQuery('txns', txnToRow(loanPaymentTxn))

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
    log(`User ${user.id} repaid ${repaymentAmount} on market ${contractId}`)

    const remainingLoan = totalOwed - repaymentAmount

    return {
      repaid: repaymentAmount,
      remainingLoan: Math.max(0, remainingLoan),
    }
  }

  // General repayment - proportional distribution
  const metricsWithLoans = metrics.filter((m) => (m.loan ?? 0) > 0)
  
  if (metricsWithLoans.length === 0) {
    throw new APIError(400, 'No outstanding loans to repay')
  }

  // Get loan tracking data
  const contractIds = [...new Set(metricsWithLoans.map((m) => m.contractId))]
  const loanTracking = await getLoanTrackingRows(pg, user.id, contractIds)
  const trackingByKey = keyBy(
    loanTracking,
    (t) => `${t.contract_id}-${t.answer_id ?? ''}`
  )

  // Calculate loans with interest
  const loansWithInterest: LoanWithInterest[] = filterDefined(
    metricsWithLoans.map((metric) => {
      const key = `${metric.contractId}-${metric.answerId ?? ''}`
      const tracking = trackingByKey[key]
      return calculateLoanWithInterest(metric, tracking, now)
    })
  )

  const totalOwed = loansWithInterest.reduce((sum, loan) => sum + loan.total, 0)
  const repaymentAmount = Math.min(amount, totalOwed)

  if (repaymentAmount <= 0) {
    throw new APIError(400, 'No outstanding loans to repay')
  }

  // Distribute repayment proportionally
  const distributions = distributeRepaymentProportionally(repaymentAmount, loansWithInterest)

  // Build contract metric updates
  const metricsById = keyBy(metrics, (m) => `${m.contractId}-${m.answerId ?? ''}`)
  const updatedMetrics = filterDefined(
    distributions.map((dist) => {
      const key = `${dist.contractId}-${dist.answerId ?? ''}`
      const metric = metricsById[key]
      if (!metric) return undefined

      const newLoan = Math.max(0, (metric.loan ?? 0) - dist.principalRepaid)
      return {
        ...metric,
        loan: newLoan,
      }
    })
  )

  // Build loan tracking updates
  const loanTrackingUpdates: Omit<LoanTrackingRow, 'id'>[] = []
  for (const dist of distributions) {
    const key = `${dist.contractId}-${dist.answerId ?? ''}`
    const tracking = trackingByKey[key]
    const loan = loansWithInterest.find(
      (l) => l.contractId === dist.contractId && l.answerId === dist.answerId
    )

    if (!loan) continue

    if (tracking) {
      // Finalize integral up to now
      const daysSinceLastUpdate = (now - tracking.last_loan_update_time) / MS_PER_DAY
      const finalIntegral =
        tracking.loan_day_integral + loan.principal * daysSinceLastUpdate

      // Reduce integral proportionally for repaid amount
      const repaymentRatio = dist.amountRepaid / loan.total
      const newIntegral = finalIntegral * (1 - repaymentRatio)

      loanTrackingUpdates.push({
        user_id: user.id,
        contract_id: dist.contractId,
        answer_id: dist.answerId,
        loan_day_integral: newIntegral,
        last_loan_update_time: now,
      })
    } else {
      // No tracking data - create new entry with zero integral
      loanTrackingUpdates.push({
        user_id: user.id,
        contract_id: dist.contractId,
        answer_id: dist.answerId,
        loan_day_integral: 0,
        last_loan_update_time: now,
      })
    }
  }

  // Create transaction
  const loanPaymentTxn: Omit<Txn, 'id' | 'createdTime'> = {
    fromId: user.id,
    fromType: 'USER',
    toId: 'BANK',
    toType: 'BANK',
    amount: -repaymentAmount,
    token: 'M$',
    category: 'LOAN_PAYMENT',
    data: {
      amountRepaid: repaymentAmount,
    },
  }

  const balanceUpdate = {
    id: user.id,
    balance: -repaymentAmount,
  }

  const bulkUpdateContractMetricsQ =
    bulkUpdateContractMetricsQuery(updatedMetrics)
  const loanTrackingQ = upsertLoanTrackingQuery(loanTrackingUpdates)
  const balanceUpdateQuery = bulkIncrementBalancesQuery([balanceUpdate])
  const txnQuery = getInsertQuery('txns', txnToRow(loanPaymentTxn))

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
  log(`User ${user.id} repaid ${repaymentAmount} in loans.`)

  // Calculate remaining loan
  const remainingLoan = totalOwed - repaymentAmount

  return {
    repaid: repaymentAmount,
    remainingLoan: Math.max(0, remainingLoan),
  }
}
