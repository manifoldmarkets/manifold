import * as admin from 'firebase-admin'

import { Bet } from '../../common/bet'
import { getRedeemableAmount, getRedemptionBets } from '../../common/redeem'

import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { floatingEqual } from '../../common/util/math'

export const redeemShares = async (userId: string, contractId: string) => {
  return await firestore.runTransaction(async (trans) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await trans.get(contractDoc)
    if (!contractSnap.exists)
      return { status: 'error', message: 'Invalid contract' }

    const contract = contractSnap.data() as Contract
    const { mechanism } = contract
    if (mechanism !== 'cpmm-1') return { status: 'success' }

    const betsColl = firestore.collection(`contracts/${contract.id}/bets`)
    const betsSnap = await trans.get(betsColl.where('userId', '==', userId))
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
    const { shares, loanPayment, netAmount } = getRedeemableAmount(bets)
    if (floatingEqual(netAmount, 0)) {
      return { status: 'success' }
    }
    const [yesBet, noBet] = getRedemptionBets(shares, loanPayment, contract)

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
