import { APIError, type APIHandler } from './helpers/endpoint'
import { Bet, getNewBetId } from 'common/bet'
import { computeRebalance } from 'common/rebalance'
import { ContractMetric } from 'common/contract-metric'
import { MarketContract } from 'common/contract'
import { noFees } from 'common/fees'
import { removeUndefinedProps } from 'common/util/object'
import { betsQueue } from 'shared/helpers/fn-queue'
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
import { contractColumnsToSelect, getContract, log } from 'shared/utils'
import { convertAnswer } from 'common/supabase/contracts'
import * as crypto from 'crypto'

export const rebalancePosition: APIHandler<
  'market/:contractId/rebalance'
> = async (props, auth) => {
  const { contractId } = props
  const userId = auth.uid
  const pg = createSupabaseDirectClient()

  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found.')
  if (contract.mechanism !== 'cpmm-multi-1' || !contract.shouldAnswersSumToOne) {
    throw new APIError(
      400,
      'Rebalance is only supported on sum-to-one multi-choice markets.'
    )
  }
  if (contract.isResolved) throw new APIError(403, 'Market is resolved.')
  if (contract.closeTime && Date.now() > contract.closeTime) {
    throw new APIError(403, 'Trading is closed.')
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
    const [metricRows, answerRows] = await tx.multi(
      `select data, margin_loan, loan from user_contract_metrics
         where contract_id = $1 and user_id = $2;
       select * from answers where contract_id = $1 order by index;`,
      [contractId, userId]
    )
    const contractMetrics: ContractMetric[] = metricRows.map(
      (r: { data: ContractMetric; loan: number | null; margin_loan: number | null }) =>
        ({
          ...r.data,
          loan: r.loan ?? r.data.loan ?? 0,
          marginLoan: r.margin_loan ?? r.data.marginLoan ?? 0,
        })
    )
    const answers = answerRows.map(convertAnswer)
    if (answers.length < 2) {
      throw new APIError(400, 'Market has fewer than two answers.')
    }
    const answerIds = answers.map((a) => a.id)

    const perAnswerMetrics = contractMetrics.filter((m) => m.answerId != null)
    const yesShares: Record<string, number> = {}
    const noShares: Record<string, number> = {}
    for (const m of perAnswerMetrics) {
      if (!m.answerId) continue
      yesShares[m.answerId] = m.totalShares['YES'] ?? 0
      noShares[m.answerId] = m.totalShares['NO'] ?? 0
    }

    // v1: disallow rebalance when loans are outstanding. Loan repayment on
    // rebalance has policy questions (what should be repaid when a position
    // shrinks but doesn't go to zero?) that are out of scope for the initial
    // cut. Users can repay via /repay-loan first.
    const totalLoan = perAnswerMetrics.reduce(
      (acc, m) => acc + (m.loan ?? 0) + (m.marginLoan ?? 0),
      0
    )
    if (totalLoan > 0) {
      throw new APIError(
        400,
        'Outstanding loans on this market — repay before rebalancing.'
      )
    }

    const rebalance = computeRebalance({ answerIds, yesShares, noShares })
    const { minShares, cashRedeemed, yesDelta, noDelta } = rebalance

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
        },
      }
    }

    const now = Date.now()
    const betGroupId = crypto.randomBytes(12).toString('hex')
    const answersById = Object.fromEntries(answers.map((a) => [a.id, a]))
    const bets: Bet[] = []
    for (const id of answerIds) {
      const answer = answersById[id]
      const p = answer.prob
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
            outcome: 'NO',
            probBefore: p,
            probAfter: p,
            fees: noFees,
            isRedemption: true,
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
            outcome: 'YES',
            probBefore: p,
            probAfter: p,
            fees: noFees,
            isRedemption: true,
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

    const balanceField = contract.token === 'CASH' ? 'cashBalance' : 'balance'
    const balanceUpdate = { id: userId, [balanceField]: cashRedeemed }

    const insertBetsQuery = bulkInsertBetsQuery(bets)
    const metricsQuery = bulkUpdateContractMetricsQuery(updatedMetrics)
    const balanceQuery = bulkIncrementBalancesQuery([balanceUpdate])

    const queryResults = await tx.multi(
      `${balanceQuery}; --0
       ${insertBetsQuery}; --1
       ${metricsQuery}; --2`
    )
    const userUpdates = queryResults[0] as UserUpdate[]
    broadcastUserUpdates(userUpdates)

    log(
      `rebalance-position ${userId} on ${contractId}: redeemed ${minShares} shares for ${cashRedeemed} ${contract.token}, ${bets.length} synthetic bets`
    )

    return {
      result: {
        cashRedeemed,
        minShares,
        betCount: bets.length,
      },
    }
  })
}
