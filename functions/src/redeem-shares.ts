import * as admin from 'firebase-admin'
import { maxBy } from 'lodash'

import { Bet } from '../../common/bet'
import {
  getRedeemableAmount,
  getRedemptionBets,
  getRedemptionBetMulti,
} from '../../common/redeem'

import { User } from '../../common/user'
import { floatingEqual } from '../../common/util/math'
import { poolToProbs } from '../../common/calculate-cpmm-multi'
import { CPMM2Contract, CPMMContract } from '../../common/contract'

export const redeemShares = async (
  userId: string,
  contract: CPMMContract | CPMM2Contract
) => {
  return await firestore.runTransaction(async (trans) => {
    const { mechanism, id: contractId } = contract

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

    const userDoc = firestore.doc(`users/${userId}`)
    const userSnap = await trans.get(userDoc)
    if (!userSnap.exists) return { status: 'error', message: 'User not found' }
    const user = userSnap.data() as User
    const newBalance = user.balance + netAmount

    if (!isFinite(newBalance)) {
      throw new Error('Invalid user balance for ' + user.username)
    }
    trans.update(userDoc, { balance: newBalance })

    if (mechanism === 'cpmm-1') {
      const lastProb = maxBy(bets, (b) => b.createdTime)?.probAfter as number
      const [yesBet, noBet] = getRedemptionBets(
        contractId,
        shares,
        loanPayment,
        lastProb
      )
      const yesDoc = betsColl.doc()
      const noDoc = betsColl.doc()

      trans.create(yesDoc, { id: yesDoc.id, userId, ...yesBet })
      trans.create(noDoc, { id: noDoc.id, userId, ...noBet })
    } else {
      const bet = getRedemptionBetMulti(
        contractId,
        shares,
        loanPayment,
        poolToProbs(contract.pool)
      )
      const betDoc = betsColl.doc()
      trans.create(betDoc, { id: betDoc.id, userId, ...bet })
    }

    return { status: 'success' }
  })
}

const firestore = admin.firestore()
