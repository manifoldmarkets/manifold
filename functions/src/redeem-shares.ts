import * as admin from 'firebase-admin'
import { partition, sumBy } from 'lodash'

import { Bet } from '../../common/bet'
import { getProbability } from '../../common/calculate'

import { Contract, CPMMContract } from '../../common/contract'
import { noFees } from '../../common/fees'
import { User } from '../../common/user'

type CandidateBet<T extends Bet> = Omit<T, 'id' | 'userId'>
type RedeemableBet = Pick<Bet, 'outcome' | 'shares' | 'loanAmount'>

const getRedeemableAmount = (bets: RedeemableBet[]) => {
  const [yesBets, noBets] = partition(bets, (b) => b.outcome === 'YES')
  const yesShares = sumBy(yesBets, (b) => b.shares)
  const noShares = sumBy(noBets, (b) => b.shares)
  const shares = Math.max(Math.min(yesShares, noShares), 0)
  const loanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)
  const loanPayment = Math.min(loanAmount, shares)
  const netAmount = shares - loanPayment
  return { shares, loanPayment, netAmount }
}

const getRedemptionBets = (
  shares: number,
  loanPayment: number,
  contract: CPMMContract
) => {
  const p = getProbability(contract)
  const createdTime = Date.now()
  const yesBet: CandidateBet<Bet> = {
    contractId: contract.id,
    amount: p * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'YES',
    probBefore: p,
    probAfter: p,
    createdTime,
    isRedemption: true,
    fees: noFees,
  }
  const noBet: CandidateBet<Bet> = {
    contractId: contract.id,
    amount: (1 - p) * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'NO',
    probBefore: p,
    probAfter: p,
    createdTime,
    isRedemption: true,
    fees: noFees,
  }
  return [yesBet, noBet]
}

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
