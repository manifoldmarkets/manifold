import * as admin from 'firebase-admin'
import { maxBy } from 'lodash'

import { Bet } from '../../common/bet'
import { getRedeemableAmount, getRedemptionBets } from '../../common/redeem'

import { User } from '../../common/user'
import { floatingEqual } from '../../common/util/math'

// Note: Assumes contract is of mechanism cpmm-1.
export const redeemShares = async (userId: string, contractId: string) => {
  return await firestore.runTransaction(async (trans) => {
    const betsColl = firestore.collection(`contracts/${contractId}/bets`)
    const betsSnap = await trans.get(betsColl.where('userId', '==', userId))
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
    const { shares, loanPayment, netAmount } = getRedeemableAmount(bets)
    if (floatingEqual(netAmount, 0)) {
      return { status: 'success' }
    }
    const lastProb = maxBy(bets, (b) => b.createdTime)?.probAfter as number
    const [yesBet, noBet] = getRedemptionBets(
      contractId,
      shares,
      loanPayment,
      lastProb
    )

    const userDoc = firestore.doc(`users/${userId}`)
    const userSnap = await trans.get(userDoc)
    if (!userSnap.exists) return { status: 'error', message: 'User not found' }
    const user = userSnap.data() as User
    const newBalance = user.balance + netAmount

    if (!isFinite(newBalance)) {
      throw new Error('Invalid user balance for ' + user.username)
    }

    const yesDoc = betsColl.doc()
    const noDoc = betsColl.doc()
    trans.update(userDoc, { balance: newBalance })
    trans.create(yesDoc, { id: yesDoc.id, userId, ...yesBet })
    trans.create(noDoc, { id: noDoc.id, userId, ...noBet })

    return { status: 'success' }
  })
}

const firestore = admin.firestore()
