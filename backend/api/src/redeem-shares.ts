import { groupBy, mapValues, maxBy, min, sum, sumBy } from 'lodash'

import { getBinaryRedeemableAmount, getRedemptionBets } from 'common/redeem'
import { floatingEqual } from 'common/util/math'

import { APIError } from 'common/api/utils'
import { log } from 'shared/utils'
import { getNewSellBetInfo } from 'common/sell-bet'
import * as crypto from 'crypto'
import { getSellAllRedemptionPreliminaryBets } from 'common/calculate-cpmm-arbitrage'
import { bulkIncrementBalances } from 'shared/supabase/users'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsertBets } from 'shared/supabase/bets'
import { convertBet } from 'common/supabase/bets'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'

export const redeemShares = async (
  pgTrans: SupabaseDirectClient,
  userIds: string[],
  contract: Contract
) => {
  if (!userIds.length) return

  const bets = await pgTrans.map(
    `select * from contract_bets where contract_id = $1 and user_id = any($2);`,
    [contract.id, userIds],
    convertBet
  )

  const betsToInsert: Omit<Bet, 'id'>[] = []
  const balanceUpdates: {
    id: string
    balance?: number
    cashBalance?: number
  }[] = []

  await Promise.all(
    userIds.map(async (userId) => {
      log(
        `Loaded ${bets.length} bets for user ${userId} on contract ${contract.id} to redeem shares`
      )

      const userNonRedemptionBetsByAnswer = groupBy(
        bets.filter((bet) => bet.shares !== 0),
        (bet) => bet.answerId
      )

      // NOTE: This isn't used, number bets aren't actually redeemed rn
      // We should be able to extend this to any sum-to-one cpmm-multi contract
      if (contract.outcomeType === 'NUMBER') {
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
        return
      }

      let totalAmount = 0
      for (const [answerIdString, nonRedemptionBets] of Object.entries(
        userNonRedemptionBetsByAnswer
      )) {
        const { shares, loanPayment, netAmount } =
          getBinaryRedeemableAmount(nonRedemptionBets)
        if (floatingEqual(shares, 0)) {
          continue
        }
        if (!isFinite(netAmount)) {
          throw new APIError(
            500,
            'Invalid redemption amount, no clue what happened here.'
          )
        }
        const answerId =
          answerIdString === 'undefined' ? undefined : answerIdString
        totalAmount += netAmount

        const lastProb = maxBy(nonRedemptionBets, (b) => b.createdTime)
          ?.probAfter as number
        const [yesBet, noBet] = getRedemptionBets(
          contract,
          shares,
          loanPayment,
          lastProb,
          answerId
        )
        const newBets = [yesBet, noBet].map((b) => ({
          userId,
          ...b,
        }))
        betsToInsert.push(...newBets)

        log('redeemed', {
          shares,
          netAmount,
        })
      }

      if (totalAmount !== 0) {
        balanceUpdates.push({
          id: userId,
          [contract.token === 'CASH' ? 'cashBalance' : 'balance']: totalAmount,
        })
      }
    })
  )
  if (betsToInsert.length > 0) {
    await bulkInsertBets(betsToInsert, pgTrans)
  }
  if (balanceUpdates.length > 0) {
    await bulkIncrementBalances(pgTrans, balanceUpdates)
  }
}
