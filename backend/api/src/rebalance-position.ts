import { APIError, type APIHandler } from './helpers/endpoint'
import { Bet, getNewBetId } from 'common/bet'
import { computeRebalance } from 'common/rebalance'
import { ContractMetric } from 'common/contract-metric'
import { MarketContract, isMultiCpmm } from 'common/contract'
import { noFees } from 'common/fees'
import { MS_PER_DAY } from 'common/loans'
import { EPSILON } from 'common/util/math'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'
import { keyBy } from 'lodash'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  getLoanTrackingRows,
  upsertLoanTrackingQuery,
  LoanTrackingRow,
} from 'shared/helpers/user-contract-loans'
import {
  bulkUpdateContractMetricsQuery,
  bulkUpdateUserMetricsWithNewBetsOnly,
} from 'shared/helpers/user-contract-metrics'
import { bulkInsertBetsQuery } from 'shared/supabase/bets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  broadcastUserUpdates,
  bulkIncrementBalancesQuery,
  UserUpdate,
} from 'shared/supabase/users'
import { getContract, log } from 'shared/utils'
import {
  broadcastNewBets,
  broadcastUpdatedMetrics,
} from 'shared/websockets/helpers'
import { convertAnswer } from 'common/supabase/contracts'

export const rebalancePosition: APIHandler<
  'market/:contractId/rebalance'
> = async (props, auth) => {
  const { contractId } = props
  const userId = auth.uid
  const pg = createSupabaseDirectClient()

  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found.')
  if (
    !isMultiCpmm(contract) ||
    !contract.shouldAnswersSumToOne
  ) {
    throw new APIError(
      400,
      'Rebalance is only supported on sum-to-one multi-choice markets.'
    )
  }
  if (contract.isResolved) throw new APIError(403, 'Market is resolved.')
  if (contract.closeTime && Date.now() > contract.closeTime) {
    throw new APIError(403, 'Trading is closed.')
  }
  if (contract.creatorBannedFromBetting && userId === contract.creatorId) {
    throw new APIError(
      403,
      'You have blocked yourself from betting on this market. Contact a moderator if you need this reversed.'
    )
  }

  const { result } = await betsQueue.enqueueFn(
    () => rebalanceInTransaction(pg, userId, contract as MarketContract),
    [userId, contractId]
  )
  return result
}

const rebalanceInTransaction = async (
  pg: ReturnType<typeof createSupabaseDirectClient>,
  userId: string,
  contract: MarketContract
) => {
  return pg.tx(async (tx) => {
    const contractId = contract.id
    const [metricRows, answerRows, userRows] = await tx.multi(
      `select data, margin_loan, loan from user_contract_metrics
         where contract_id = $1 and user_id = $2;
       select * from answers where contract_id = $1 order by index;
       select balance, cash_balance from users where id = $2;`,
      [contractId, userId]
    )
    const contractMetrics: ContractMetric[] = metricRows.map(
      (r: {
        data: ContractMetric
        loan: number | null
        margin_loan: number | null
      }) => ({
        ...r.data,
        loan: r.loan ?? r.data.loan ?? 0,
        marginLoan: r.margin_loan ?? r.data.marginLoan ?? 0,
      })
    )
    const answers = answerRows.map(convertAnswer)
    if (answers.length < 2) {
      throw new APIError(400, 'Market has fewer than two answers.')
    }
    if (userRows.length === 0) {
      throw new APIError(404, 'User not found.')
    }
    const preBalance =
      contract.token === 'CASH'
        ? Number(userRows[0].cash_balance)
        : Number(userRows[0].balance)

    const answerIds = answers.map((a) => a.id)
    const perAnswerMetrics = contractMetrics.filter((m) => m.answerId != null)
    const metricByAnswer = Object.fromEntries(
      perAnswerMetrics.map((m) => [m.answerId!, m])
    )
    const yesShares: Record<string, number> = {}
    const noShares: Record<string, number> = {}
    for (const id of answerIds) {
      const m = metricByAnswer[id]
      yesShares[id] = m?.totalShares['YES'] ?? 0
      noShares[id] = m?.totalShares['NO'] ?? 0
    }

    const rebalance = computeRebalance({ answerIds, yesShares, noShares })
    const { minShares, cashRedeemed, yesDelta, noDelta, finalYesShares } =
      rebalance

    const hasAnyDelta = answerIds.some(
      (id) => yesDelta[id] !== 0 || noDelta[id] !== 0
    )
    if (!hasAnyDelta) {
      log(`rebalance-position no-op for ${userId} on ${contractId}`)
      return {
        result: {
          cashRedeemed: 0,
          minShares: 0,
          betCount: 0,
          loanPaid: 0,
        },
      }
    }

    const now = Date.now()

    // Fetch loan tracking before we calculate repayments
    const loanTracking = await getLoanTrackingRows(tx, userId, [contractId])
    const trackingByKey = keyBy(
      loanTracking,
      (t) => `${t.contract_id}-${t.answer_id ?? ''}`
    )
    const loanTrackingUpdates: Omit<LoanTrackingRow, 'id'>[] = []

    // Loan policy: repay proportionally based on the fraction of shares redeemed.
    const loanByAnswer: Record<string, number> = {}
    for (const id of answerIds) {
      const m = metricByAnswer[id]
      if (!m) {
        loanByAnswer[id] = 0
        continue
      }

      const ys = yesShares[id] ?? 0
      const finalYes = finalYesShares[id]
      const marginLoanBefore = m.marginLoan ?? 0
      const answerLoan = (m.loan ?? 0) + marginLoanBefore

      // Repay proportionally, matching sell-shares.ts
      if (ys > 0 && finalYes < ys) {
        loanByAnswer[id] = answerLoan * ((ys - finalYes) / ys)
      } else {
        loanByAnswer[id] = 0
      }

      // If we repaid any margin loan, update the tracking integral
      if (loanByAnswer[id] > 0 && marginLoanBefore > 0) {
        const marginLoanRatio = marginLoanBefore / answerLoan
        const marginLoanRepaid = loanByAnswer[id] * marginLoanRatio

        const trackingKey = `${contractId}-${id}`
        const tracking = trackingByKey[trackingKey]

        const lastUpdate = tracking?.last_loan_update_time ?? now
        const daysSinceLastUpdate = (now - lastUpdate) / MS_PER_DAY
        const finalIntegral =
          (tracking?.loan_day_integral ?? 0) +
          marginLoanBefore * daysSinceLastUpdate

        const repaymentRatio = Math.min(1, marginLoanRepaid / marginLoanBefore)
        const newIntegral = finalIntegral * (1 - repaymentRatio)

        loanTrackingUpdates.push({
          user_id: userId,
          contract_id: contractId,
          answer_id: id,
          loan_day_integral: Math.max(0, newIntegral),
          last_loan_update_time: now,
        })
      }
    }
    const totalLoanPaid = Object.values(loanByAnswer).reduce((a, b) => a + b, 0)

    // Loans only exist on MANA markets (claim-free-loan gates on this). If we
    // somehow see one on a CASH contract, something is very wrong — bail out.
    if (contract.token === 'CASH' && totalLoanPaid > 0) {
      throw new APIError(
        500,
        'Unexpected loan on CASH contract — aborting rebalance.'
      )
    }

    const betGroupId = randomString(12)
    const answersById = Object.fromEntries(answers.map((a) => [a.id, a]))
    const bets: Bet[] = []
    for (const id of answerIds) {
      const answer = answersById[id]
      const p = answer.prob
      // Pre-count how many bets this answer will emit so we can split
      // loanAmount evenly across them. calculateUserMetricsWithNewBetsOnly
      // groups loanAmount per (userId, answerId) so splitting here is fine.
      const emits = (noDelta[id] !== 0 ? 1 : 0) + (yesDelta[id] !== 0 ? 1 : 0)
      const loanPerBet = emits > 0 ? -loanByAnswer[id] / emits : 0
      if (noDelta[id] !== 0) {
        bets.push(
          removeUndefinedProps({
            id: getNewBetId(),
            userId,
            contractId,
            answerId: id,
            createdTime: now,
            amount: noDelta[id] * (1 - p),
            shares: noDelta[id],
            loanAmount: loanPerBet,
            outcome: 'NO',
            probBefore: p,
            probAfter: p,
            fees: noFees,
            isRedemption: true,
            isRebalance: true,
            visibility: contract.visibility,
            betGroupId,
          }) as Bet
        )
      }
      if (yesDelta[id] !== 0) {
        bets.push(
          removeUndefinedProps({
            id: getNewBetId(),
            userId,
            contractId,
            answerId: id,
            createdTime: now,
            amount: yesDelta[id] * p,
            shares: yesDelta[id],
            loanAmount: loanPerBet,
            outcome: 'YES',
            probBefore: p,
            probAfter: p,
            fees: noFees,
            isRedemption: true,
            isRebalance: true,
            visibility: contract.visibility,
            betGroupId,
          }) as Bet
        )
      }
    }

    const updatedMetrics = await bulkUpdateUserMetricsWithNewBetsOnly(
      tx,
      bets,
      contractMetrics,
      false
    )

    // Loans are always mana-denominated; cash redemption credits whichever
    // token the contract is in.
    const _cashField = contract.token === 'CASH' ? 'cashBalance' : 'balance'
    const balanceUpdate: {
      id: string
      balance?: number
      cashBalance?: number
    } = { id: userId }
    if (contract.token === 'CASH') {
      balanceUpdate.cashBalance = cashRedeemed
      // totalLoanPaid is guaranteed 0 here; no balance change.
    } else {
      balanceUpdate.balance = cashRedeemed - totalLoanPaid
    }

    const insertBetsQuery = bulkInsertBetsQuery(bets)
    const metricsQuery = bulkUpdateContractMetricsQuery(updatedMetrics)
    const balanceQuery = bulkIncrementBalancesQuery([balanceUpdate])
    const loanTrackingQuery =
      loanTrackingUpdates.length > 0
        ? upsertLoanTrackingQuery(loanTrackingUpdates)
        : 'select 1 where false'

    const queryResults = await tx.multi(
      `${balanceQuery}; --0
       ${insertBetsQuery}; --1
       ${metricsQuery}; --2
       ${loanTrackingQuery}; --3`
    )
    const userUpdates = queryResults[0] as UserUpdate[]

    // Sell-shares-style guard: if loan repayment drove the balance negative
    // from a non-negative starting point, fail. Matches place-bet.ts:628-636.
    // Only relevant when we're decrementing — pure credit (no loans) can
    // only move balance up.
    if (totalLoanPaid > 0 && userUpdates.length > 0) {
      const postBalance = Number(userUpdates[0].balance)
      if (postBalance < -EPSILON && postBalance < preBalance) {
        throw new APIError(
          403,
          'Insufficient balance to cover loan repayment on rebalance.'
        )
      }
    }
    broadcastUserUpdates(userUpdates)
    broadcastUpdatedMetrics(updatedMetrics)
    broadcastNewBets(contractId, contract.visibility, bets)

    log(
      `rebalance-position ${userId} on ${contractId}: redeemed ${minShares} shares for ${cashRedeemed} ${contract.token}, loan repaid ${totalLoanPaid}, ${bets.length} synthetic bets`
    )

    return {
      result: {
        cashRedeemed,
        minShares,
        betCount: bets.length,
        loanPaid: totalLoanPaid,
      },
    }
  })
}
