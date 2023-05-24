import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { maxBy } from 'lodash'

import { Bet } from 'common/bet'
import {
  getRedeemableAmount,
  getRedemptionBets,
} from 'common/redeem'
import { floatingEqual } from 'common/util/math'
import { CPMMContract } from 'common/contract'

export const redeemShares = async (userId: string, contract: CPMMContract) => {
  return await firestore.runTransaction(async (trans) => {
    const { id: contractId } = contract

    const betsColl = firestore.collection(`contracts/${contractId}/bets`)
    const betsSnap = await trans.get(betsColl.where('userId', '==', userId))
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)

    const { shares, loanPayment, netAmount } = getRedeemableAmount(
      contract,
      bets
    )
    if (floatingEqual(shares, 0)) {
      return { status: 'success' }
    }

    if (!isFinite(netAmount)) {
      throw new Error('Invalid redemption amount, no clue what happened here.')
    }

    const userDoc = firestore.collection('users').doc(userId)
    trans.update(userDoc, { balance: FieldValue.increment(netAmount) })

    const lastProb = maxBy(bets, (b) => b.createdTime)?.probAfter as number
    const [yesBet, noBet] = getRedemptionBets(
      contract,
      shares,
      loanPayment,
      lastProb
    )
    const yesDoc = betsColl.doc()
    const noDoc = betsColl.doc()

    trans.create(yesDoc, { id: yesDoc.id, userId, ...yesBet })
    trans.create(noDoc, { id: noDoc.id, userId, ...noBet })
    return { status: 'success' }
  })
}

const firestore = admin.firestore()
