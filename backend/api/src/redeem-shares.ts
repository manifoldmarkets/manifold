import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { groupBy, maxBy, sum, sumBy } from 'lodash'

import { Bet } from 'common/bet'
import { getBinaryRedeemableAmount, getRedemptionBets } from 'common/redeem'
import { floatingEqual } from 'common/util/math'
import { CPMMContract, CPMMMultiContract } from 'common/contract'

export const redeemShares = async (
  userId: string,
  contract: CPMMContract | CPMMMultiContract
) => {
  return await firestore.runTransaction(async (trans) => {
    const { id: contractId } = contract

    const betsColl = firestore.collection(`contracts/${contractId}/bets`)
    const betsSnap = await trans.get(betsColl.where('userId', '==', userId))
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)

    const betsByAnswerId = groupBy(bets, (bet) => bet.answerId)
    let totalAmount = 0

    for (const [answerId, bets] of Object.entries(betsByAnswerId)) {
      const { shares, loanPayment, netAmount } = getBinaryRedeemableAmount(bets)
      if (floatingEqual(shares, 0)) {
        continue
      }
      if (!isFinite(netAmount)) {
        throw new Error(
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
        answerId
      )
      const yesDoc = betsColl.doc()
      const noDoc = betsColl.doc()

      trans.create(yesDoc, { id: yesDoc.id, userId, ...yesBet })
      trans.create(noDoc, { id: noDoc.id, userId, ...noBet })

      console.log('redeemed', shares, 'shares for', netAmount)
    }

    const userDoc = firestore.collection('users').doc(userId)
    trans.update(userDoc, { balance: FieldValue.increment(totalAmount) })

    return { status: 'success' }
  })
}

const firestore = admin.firestore()
