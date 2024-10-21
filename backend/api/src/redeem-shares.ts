import { groupBy, mapValues, min, orderBy, sum, sumBy } from 'lodash'

import {
  getBinaryRedeemableAmountFromContractMetric,
  getRedemptionBets,
} from 'common/redeem'
import { floatingEqual } from 'common/util/math'

import { APIError } from 'common/api/utils'
import { log } from 'shared/utils'
import { getNewSellBetInfo } from 'common/sell-bet'
import * as crypto from 'crypto'
import { getSellAllRedemptionPreliminaryBets } from 'common/calculate-cpmm-arbitrage'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { convertBet } from 'common/supabase/bets'
import { Bet, getNewBetId } from 'common/bet'
import { Contract } from 'common/contract'
import { MarginalBet } from 'common/calculate-metrics'
import { ContractMetric } from 'common/contract-metric'
import { bulkUpdateUserMetricsWithNewBetsOnly } from 'shared/helpers/user-contract-metrics'
export const redeemShares = async (
  pgTrans: SupabaseDirectClient,
  userIds: string[],
  contract: Contract,
  newBets: MarginalBet[],
  contractMetrics: ContractMetric[]
) => {
  const betsToInsert: Bet[] = []
  const balanceUpdates: {
    id: string
    balance?: number
    cashBalance?: number
  }[] = []

  if (!userIds.length)
    return {
      betsToInsert,
      updatedMetrics: contractMetrics,
      balanceUpdates,
    }

  const bets =
    contract.outcomeType === 'NUMBER'
      ? await pgTrans.map(
          `select * from contract_bets where contract_id = $1 and user_id = any($2);`,
          [contract.id, userIds],
          convertBet
        )
      : []

  for (const userId of userIds) {
    // This should work for any sum-to-one cpmm-multi contract, as well
    if (contract.outcomeType === 'NUMBER') {
      const userNonRedemptionBetsByAnswer = groupBy(
        bets.filter((bet) => bet.shares !== 0 && bet.userId === userId),
        (bet) => bet.answerId
      )
      log(
        `Loaded ${bets.length} bets for user ${userId} on contract ${contract.id} to redeem shares`
      )

      const answersToSharesIn = mapValues(
        userNonRedemptionBetsByAnswer,
        (bets) => sumBy(bets, (b) => b.shares)
      )
      const allShares = Object.values(answersToSharesIn)
      const minShares = min(allShares) ?? 0
      if (minShares > 0 && allShares.length === contract.answers.length) {
        const loanAmountByAnswerId = mapValues(
          groupBy(bets, 'answerId'),
          (bets) => sumBy(bets, (bet) => bet.loanAmount ?? 0)
        )

        const saleBets = getSellAllRedemptionPreliminaryBets(
          contract.answers,
          minShares,
          contract.collectedFees,
          Date.now()
        )

        const now = Date.now()
        const sellBetCandidates = saleBets.map((b) =>
          getNewSellBetInfo(
            b,
            now,
            contract.answers,
            contract,
            loanAmountByAnswerId
          )
        )

        const saleValue = -sumBy(sellBetCandidates, (r) => r.bet.amount)
        const loanPaid = sum(Object.values(loanAmountByAnswerId))
        const incrementAmount = saleValue - loanPaid

        if (incrementAmount !== 0) {
          balanceUpdates.push({
            id: userId,
            [contract.token === 'CASH' ? 'cashBalance' : 'balance']:
              incrementAmount,
          })
        }

        const betGroupId = crypto.randomBytes(12).toString('hex')
        betsToInsert.push(
          ...sellBetCandidates.map((b) => ({
            id: getNewBetId(),
            userId,
            ...b.newBet,
            betGroupId,
          }))
        )

        log('cpmm-multi-1 redeemed', {
          shares: minShares,
          totalAmount: saleValue,
        })
      }
    } else {
      let totalAmountRedeemed = 0
      for (const metric of contractMetrics.filter((m) => m.userId === userId)) {
        const newUsersBets = newBets.filter(
          (b) => b.answerId == metric.answerId && b.userId === userId
        )
        if (!newUsersBets.length) continue

        const { shares, loanPayment, netAmount } =
          getBinaryRedeemableAmountFromContractMetric(metric)
        if (floatingEqual(shares, 0)) {
          continue
        }
        if (!isFinite(netAmount)) {
          throw new APIError(
            500,
            'Invalid redemption amount, no clue what happened here.'
          )
        }
        totalAmountRedeemed += netAmount
        const answerId = metric.answerId ?? undefined
        const lastProb = orderBy(newUsersBets, 'createdTime', 'desc')[0]
          .probAfter
        betsToInsert.push(
          ...getRedemptionBets(
            contract,
            shares,
            loanPayment,
            lastProb,
            answerId,
            userId
          )
        )
        log('redeeming', {
          shares,
          netAmount,
          answerId,
          userId,
        })
      }

      if (totalAmountRedeemed !== 0) {
        balanceUpdates.push({
          id: userId,
          [contract.token === 'CASH' ? 'cashBalance' : 'balance']:
            totalAmountRedeemed,
        })
      }
    }
  }
  const updatedMetrics = await bulkUpdateUserMetricsWithNewBetsOnly(
    pgTrans,
    bets,
    contractMetrics,
    false
  )
  return {
    updatedMetrics,
    balanceUpdates,
    betsToInsert,
  }
}
