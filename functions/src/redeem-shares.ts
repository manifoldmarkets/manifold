import * as admin from 'firebase-admin'
import { partition, sumBy } from 'lodash'

import { Bet } from '../../common/bet'
import { getProbability } from '../../common/calculate'

import { Contract } from '../../common/contract'
import { noFees } from '../../common/fees'
import { User } from '../../common/user'

export const redeemShares = async (userId: string, contractId: string) => {
  return await firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists)
      return { status: 'error', message: 'Invalid contract' }

    const contract = contractSnap.data() as Contract
    if (contract.outcomeType !== 'BINARY' || contract.mechanism !== 'cpmm-1')
      return { status: 'success' }

    const betsSnap = await transaction.get(
      firestore
        .collection(`contracts/${contract.id}/bets`)
        .where('userId', '==', userId)
    )
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
    const [yesBets, noBets] = partition(bets, (b) => b.outcome === 'YES')
    const yesShares = sumBy(yesBets, (b) => b.shares)
    const noShares = sumBy(noBets, (b) => b.shares)

    const amount = Math.min(yesShares, noShares)
    if (amount <= 0) return

    const prevLoanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)
    const loanPaid = Math.min(prevLoanAmount, amount)
    const netAmount = amount - loanPaid

    const p = getProbability(contract)
    const createdTime = Date.now()

    const yesDoc = firestore.collection(`contracts/${contract.id}/bets`).doc()
    const yesBet: Bet = {
      id: yesDoc.id,
      userId: userId,
      contractId: contract.id,
      amount: p * -amount,
      shares: -amount,
      loanAmount: loanPaid ? -loanPaid / 2 : 0,
      outcome: 'YES',
      probBefore: p,
      probAfter: p,
      createdTime,
      isRedemption: true,
      fees: noFees,
    }

    const noDoc = firestore.collection(`contracts/${contract.id}/bets`).doc()
    const noBet: Bet = {
      id: noDoc.id,
      userId: userId,
      contractId: contract.id,
      amount: (1 - p) * -amount,
      shares: -amount,
      loanAmount: loanPaid ? -loanPaid / 2 : 0,
      outcome: 'NO',
      probBefore: p,
      probAfter: p,
      createdTime,
      isRedemption: true,
      fees: noFees,
    }

    const userDoc = firestore.doc(`users/${userId}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) return { status: 'error', message: 'User not found' }

    const user = userSnap.data() as User

    const newBalance = user.balance + netAmount

    if (!isFinite(newBalance)) {
      throw new Error('Invalid user balance for ' + user.username)
    }

    transaction.update(userDoc, { balance: newBalance })

    transaction.create(yesDoc, yesBet)
    transaction.create(noDoc, noBet)

    return { status: 'success' }
  })
}

const firestore = admin.firestore()
