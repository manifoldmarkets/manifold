import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import {
  calculateLoanWithInterest,
  LoanWithInterest,
  MS_PER_DAY,
} from 'common/loans'
import { Txn } from 'common/txn'
import { txnToRow } from 'shared/txn/run-txn'
import { filterDefined } from 'common/util/array'
import { getUnresolvedContractMetricsContractsAnswers } from 'shared/update-user-portfolio-histories-core'
import { keyBy, sumBy } from 'lodash'
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
import { ContractMetric } from 'common/contract-metric'

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
  const { metrics } = await getUnresolvedContractMetricsContractsAnswers(pg, [
    user.id,
  ])

  // Market-specific repayment
  if (contractId) {
    const contractMetrics = metrics.filter((m) => m.contractId === contractId)

    // If answerId is provided, only repay on that specific answer
    // Otherwise, repay across all metrics on this contract
    const metricsToRepay = answerId
      ? contractMetrics.filter((m) => m.answerId === answerId)
      : contractMetrics.filter((m) => (m.loan ?? 0) + (m.marginLoan ?? 0) > 0)

    if (metricsToRepay.length === 0) {
      throw new APIError(400, 'No outstanding loan on this market')
    }

    // Get loan tracking data for interest calculation
    const loanTracking = await getLoanTrackingRows(pg, user.id, [contractId])
    const trackingByKey = keyBy(
      loanTracking,
      (t) => `${t.contract_id}-${t.answer_id ?? ''}`
    )

    // Calculate margin loans with interest for all metrics
    const marginLoansWithInterest: (LoanWithInterest & {
      metricKey: string
      metric: ContractMetric
    })[] = filterDefined(
      metricsToRepay.map((metric) => {
        const marginLoan = metric.marginLoan ?? 0
        if (marginLoan <= 0) return undefined
        const key = `${metric.contractId}-${metric.answerId ?? ''}`
        const tracking = trackingByKey[key]
        const loanWithInterest = calculateLoanWithInterest(
          metric,
          tracking,
          now
        )
        return { ...loanWithInterest, metricKey: key, metric }
      })
    )

    // Calculate totals across all metrics on this contract
    const totalMarginOwed = sumBy(marginLoansWithInterest, (l) => l.total)
    const totalFreeLoan = sumBy(metricsToRepay, (m) => m.loan ?? 0)
    const totalOwed = totalMarginOwed + totalFreeLoan

    if (totalOwed <= 0) {
      throw new APIError(400, 'No outstanding loan on this market')
    }

    if (amount > totalOwed) {
      throw new APIError(
        400,
        `Can only repay up to ${totalOwed.toFixed(2)} on this market`
      )
    }

    // Distribute repayment: margin loans first, then free loans
    let remainingRepayment = amount
    const metricUpdates: Map<
      string,
      { freeLoanRepaid: number; marginPrincipalRepaid: number }
    > = new Map()

    // Initialize all metrics
    for (const metric of metricsToRepay) {
      const key = `${metric.contractId}-${metric.answerId ?? ''}`
      metricUpdates.set(key, { freeLoanRepaid: 0, marginPrincipalRepaid: 0 })
    }

    // First pass: repay margin loans proportionally
    let totalMarginRepaid = 0
    let totalInterestRepaid = 0
    if (totalMarginOwed > 0 && remainingRepayment > 0) {
      const marginRepayment = Math.min(remainingRepayment, totalMarginOwed)
      for (const loan of marginLoansWithInterest) {
        const proportion = loan.total / totalMarginOwed
        const amountForLoan = marginRepayment * proportion
        const principalRatio = loan.principal / loan.total
        const principalRepaid = amountForLoan * principalRatio
        const interestRepaid = amountForLoan * (1 - principalRatio)

        const update = metricUpdates.get(loan.metricKey)!
        update.marginPrincipalRepaid = principalRepaid
        totalInterestRepaid += interestRepaid
      }
      totalMarginRepaid = marginRepayment
      remainingRepayment -= marginRepayment
    }

    // Second pass: repay free loans proportionally
    let totalFreeLoanRepaid = 0
    if (totalFreeLoan > 0 && remainingRepayment > 0) {
      const freeLoanRepayment = Math.min(remainingRepayment, totalFreeLoan)
      for (const metric of metricsToRepay) {
        const freeLoan = metric.loan ?? 0
        if (freeLoan <= 0) continue
        const proportion = freeLoan / totalFreeLoan
        const amountForLoan = freeLoanRepayment * proportion

        const key = `${metric.contractId}-${metric.answerId ?? ''}`
        const update = metricUpdates.get(key)!
        update.freeLoanRepaid = amountForLoan
      }
      totalFreeLoanRepaid = freeLoanRepayment
      remainingRepayment -= freeLoanRepayment
    }

    const repaymentAmount = totalMarginRepaid + totalFreeLoanRepaid

    // Build contract metric updates
    const metricsById = keyBy(
      metricsToRepay,
      (m) => `${m.contractId}-${m.answerId ?? ''}`
    )
    const updatedMetrics: ContractMetric[] = filterDefined(
      Array.from(metricUpdates.entries()).map(([key, update]) => {
        const metric = metricsById[key]
        if (!metric) return undefined
        if (update.freeLoanRepaid === 0 && update.marginPrincipalRepaid === 0)
          return undefined

        return {
          ...metric,
          loan: Math.max(0, (metric.loan ?? 0) - update.freeLoanRepaid),
          marginLoan: Math.max(
            0,
            (metric.marginLoan ?? 0) - update.marginPrincipalRepaid
          ),
        }
      })
    )

    // Build loan tracking updates (only for margin loans)
    const loanTrackingUpdate: Omit<LoanTrackingRow, 'id'>[] = []
    for (const loan of marginLoansWithInterest) {
      const update = metricUpdates.get(loan.metricKey)
      if (!update || update.marginPrincipalRepaid === 0) continue

      const tracking = trackingByKey[loan.metricKey]
      if (tracking) {
        const daysSinceLastUpdate =
          (now - tracking.last_loan_update_time) / MS_PER_DAY
        const finalIntegral =
          tracking.loan_day_integral + loan.principal * daysSinceLastUpdate

        const amountRepaidOnThisLoan =
          update.marginPrincipalRepaid +
          (update.marginPrincipalRepaid / loan.principal) *
            (loan.total - loan.principal)
        const repaymentRatio = amountRepaidOnThisLoan / loan.total
        const newIntegral = finalIntegral * (1 - repaymentRatio)

        loanTrackingUpdate.push({
          user_id: user.id,
          contract_id: loan.contractId,
          answer_id: loan.answerId,
          loan_day_integral: Math.max(0, newIntegral),
          last_loan_update_time: now,
        })
      } else {
        loanTrackingUpdate.push({
          user_id: user.id,
          contract_id: loan.contractId,
          answer_id: loan.answerId,
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
        marginRepaid: totalMarginRepaid,
        freeLoanRepaid: totalFreeLoanRepaid,
        interestRepaid: totalInterestRepaid,
      },
    }

    const balanceUpdate = {
      id: user.id,
      balance: -repaymentAmount,
    }

    const bulkUpdateContractMetricsQ =
      bulkUpdateContractMetricsQuery(updatedMetrics)
    const loanTrackingQ =
      loanTrackingUpdate.length > 0
        ? upsertLoanTrackingQuery(loanTrackingUpdate)
        : 'SELECT 1'
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
    log(
      `User ${user.id} repaid ${repaymentAmount} on market ${contractId} (margin: ${totalMarginRepaid}, free: ${totalFreeLoanRepaid})`
    )

    const remainingLoan = totalOwed - repaymentAmount

    return {
      repaid: repaymentAmount,
      remainingLoan: Math.max(0, remainingLoan),
    }
  }

  // General repayment - repay margin loans first, then free loans
  const metricsWithLoans = metrics.filter(
    (m) => (m.loan ?? 0) > 0 || (m.marginLoan ?? 0) > 0
  )

  if (metricsWithLoans.length === 0) {
    throw new APIError(400, 'No outstanding loans to repay')
  }

  // Get loan tracking data for margin loans
  const contractIds = [...new Set(metricsWithLoans.map((m) => m.contractId))]
  const loanTracking = await getLoanTrackingRows(pg, user.id, contractIds)
  const trackingByKey = keyBy(
    loanTracking,
    (t) => `${t.contract_id}-${t.answer_id ?? ''}`
  )

  // Calculate margin loans with interest
  const marginLoansWithInterest: (LoanWithInterest & { metricKey: string })[] =
    filterDefined(
      metricsWithLoans.map((metric) => {
        const marginLoan = metric.marginLoan ?? 0
        if (marginLoan <= 0) return undefined
        const key = `${metric.contractId}-${metric.answerId ?? ''}`
        const tracking = trackingByKey[key]
        const loanWithInterest = calculateLoanWithInterest(
          metric,
          tracking,
          now
        )
        return { ...loanWithInterest, metricKey: key }
      })
    )

  // Calculate totals
  const totalMarginOwed = sumBy(marginLoansWithInterest, (l) => l.total)
  const totalFreeLoan = sumBy(metricsWithLoans, (m) => m.loan ?? 0)
  const totalOwed = totalMarginOwed + totalFreeLoan
  const repaymentAmount = Math.min(amount, totalOwed)

  if (repaymentAmount <= 0) {
    throw new APIError(400, 'No outstanding loans to repay')
  }

  // Distribute repayment: margin loans first, then free loans
  let remainingRepayment = repaymentAmount
  const metricUpdates: Map<
    string,
    { freeLoanRepaid: number; marginPrincipalRepaid: number }
  > = new Map()

  // Initialize all metrics
  for (const metric of metricsWithLoans) {
    const key = `${metric.contractId}-${metric.answerId ?? ''}`
    metricUpdates.set(key, { freeLoanRepaid: 0, marginPrincipalRepaid: 0 })
  }

  // First pass: repay margin loans proportionally
  if (totalMarginOwed > 0 && remainingRepayment > 0) {
    const marginRepayment = Math.min(remainingRepayment, totalMarginOwed)
    for (const loan of marginLoansWithInterest) {
      const proportion = loan.total / totalMarginOwed
      const amountForLoan = marginRepayment * proportion
      const principalRatio = loan.principal / loan.total
      const principalRepaid = amountForLoan * principalRatio

      const update = metricUpdates.get(loan.metricKey)!
      update.marginPrincipalRepaid = principalRepaid
    }
    remainingRepayment -= marginRepayment
  }

  // Second pass: repay free loans proportionally
  if (totalFreeLoan > 0 && remainingRepayment > 0) {
    const freeLoanRepayment = Math.min(remainingRepayment, totalFreeLoan)
    for (const metric of metricsWithLoans) {
      const freeLoan = metric.loan ?? 0
      if (freeLoan <= 0) continue
      const proportion = freeLoan / totalFreeLoan
      const amountForLoan = freeLoanRepayment * proportion

      const key = `${metric.contractId}-${metric.answerId ?? ''}`
      const update = metricUpdates.get(key)!
      update.freeLoanRepaid = amountForLoan
    }
    remainingRepayment -= freeLoanRepayment
  }

  // Build contract metric updates
  const metricsById = keyBy(
    metrics,
    (m) => `${m.contractId}-${m.answerId ?? ''}`
  )
  const updatedMetrics: ContractMetric[] = filterDefined(
    Array.from(metricUpdates.entries()).map(([key, update]) => {
      const metric = metricsById[key]
      if (!metric) return undefined
      if (update.freeLoanRepaid === 0 && update.marginPrincipalRepaid === 0)
        return undefined

      return {
        ...metric,
        loan: Math.max(0, (metric.loan ?? 0) - update.freeLoanRepaid),
        marginLoan: Math.max(
          0,
          (metric.marginLoan ?? 0) - update.marginPrincipalRepaid
        ),
      }
    })
  )

  // Build loan tracking updates (only for margin loans)
  const loanTrackingUpdates: Omit<LoanTrackingRow, 'id'>[] = []
  for (const loan of marginLoansWithInterest) {
    const update = metricUpdates.get(loan.metricKey)
    if (!update || update.marginPrincipalRepaid === 0) continue

    const tracking = trackingByKey[loan.metricKey]
    if (tracking) {
      const daysSinceLastUpdate =
        (now - tracking.last_loan_update_time) / MS_PER_DAY
      const finalIntegral =
        tracking.loan_day_integral + loan.principal * daysSinceLastUpdate

      // Calculate what fraction of the margin loan was repaid
      const amountRepaidOnThisLoan =
        update.marginPrincipalRepaid +
        (update.marginPrincipalRepaid / loan.principal) *
          (loan.total - loan.principal)
      const repaymentRatio = amountRepaidOnThisLoan / loan.total
      const newIntegral = finalIntegral * (1 - repaymentRatio)

      loanTrackingUpdates.push({
        user_id: user.id,
        contract_id: loan.contractId,
        answer_id: loan.answerId,
        loan_day_integral: Math.max(0, newIntegral),
        last_loan_update_time: now,
      })
    } else {
      loanTrackingUpdates.push({
        user_id: user.id,
        contract_id: loan.contractId,
        answer_id: loan.answerId,
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
  const loanTrackingQ =
    loanTrackingUpdates.length > 0
      ? upsertLoanTrackingQuery(loanTrackingUpdates)
      : 'SELECT 1'
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
