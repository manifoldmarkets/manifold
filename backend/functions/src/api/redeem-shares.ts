import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { maxBy } from 'lodash'

import { Bet } from 'common/bet'
import {
  getRedeemableAmount,
  getRedemptionBets,
  getRedemptionBetMulti,
} from 'common/redeem'
import { floatingEqual } from 'common/util/math'
import { poolToProbs } from 'common/calculate-cpmm-multi'
import { CPMM2Contract, CPMMContract } from 'common/contract'

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

    if (!isFinite(netAmount)) {
      throw new Error('Invalid redemption amount, no clue what happened here.')
    }

    const userDoc = firestore.collection('users').doc(userId)
    trans.update(userDoc, { balance: FieldValue.increment(netAmount) })

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
