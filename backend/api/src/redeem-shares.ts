import * as admin from 'firebase-admin'
import { groupBy, mapValues, maxBy, min, sum, sumBy } from 'lodash'

import { Bet } from 'common/bet'
import { getBinaryRedeemableAmount, getRedemptionBets } from 'common/redeem'
import { floatingEqual } from 'common/util/math'
import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from 'common/contract'
import { APIError } from 'common/api/utils'
import { log } from 'shared/utils'
import { getNewSellBetInfo } from 'common/sell-bet'
import * as crypto from 'crypto'
import { getSellAllRedemptionPreliminaryBets } from 'common/calculate-cpmm-arbitrage'
import { incrementBalance } from 'shared/supabase/users'
import { runEvilTransaction } from 'shared/evil-transaction'

export const redeemShares = async (
  userId: string,
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract
) => {
  return await runEvilTransaction(async (pgTrans, fbTrans) => {
    const { id: contractId } = contract

    const betsColl = firestore.collection(`contracts/${contractId}/bets`)
    const betsSnap = await fbTrans.get(betsColl.where('userId', '==', userId))
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
    log(
      `Loaded ${bets.length} bets for user ${userId} on contract ${contractId} to redeem shares`
    )

    const userNonRedemptionBetsByAnswer = groupBy(
      bets.filter((bet) => bet.shares !== 0),
      (bet) => bet.answerId
    )

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

        await incrementBalance(pgTrans, userId, {
          balance: saleValue - loanPaid,
        })

        const betGroupId = crypto.randomBytes(12).toString('hex')
        for (const sale of sellBetCandidates) {
          const doc = betsColl.doc()
          fbTrans.create(doc, {
            id: doc.id,
            userId,
            ...sale.newBet,
            betGroupId,
          })
        }
        log('cpmm-multi-1 redeemed', {
          shares: minShares,
          totalAmount: saleValue,
        })
        return { status: 'success' }
      }
    }

    let totalAmount = 0

    for (const [answerId, bets] of Object.entries(
      userNonRedemptionBetsByAnswer
    )) {
      const { shares, loanPayment, netAmount } = getBinaryRedeemableAmount(bets)
      if (floatingEqual(shares, 0)) {
        continue
      }
      if (!isFinite(netAmount)) {
        throw new APIError(
          500,
          'Invalid redemption amount, no clue what happened here.'
        )
      }

      totalAmount += netAmount

      const lastProb = maxBy(bets, (b) => b.createdTime)?.probAfter as number
      const [yesBet, noBet] = getRedemptionBets(
        contract,
        shares,
        loanPayment,
        lastProb,
        answerId === 'undefined' ? undefined : answerId
      )
      const yesDoc = betsColl.doc()
      const noDoc = betsColl.doc()

      fbTrans.create(yesDoc, { id: yesDoc.id, userId, ...yesBet })
      fbTrans.create(noDoc, { id: noDoc.id, userId, ...noBet })

      log('redeemed', {
        shares,
        netAmount,
      })
    }

    await incrementBalance(pgTrans, userId, { balance: totalAmount })

    return { status: 'success' }
  })
}

const firestore = admin.firestore()
