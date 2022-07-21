import * as admin from 'firebase-admin'
import { z } from 'zod'
import {
  DocumentReference,
  FieldValue,
  Query,
  Transaction,
} from 'firebase-admin/firestore'
import { groupBy, mapValues, sumBy, uniq } from 'lodash'

import { APIError, newEndpoint, validate } from './api'
import { Contract, CPMM_MIN_POOL_QTY } from '../../common/contract'
import { User } from '../../common/user'
import {
  BetInfo,
  getBinaryCpmmBetInfo,
  getNewMultiBetInfo,
  getNumericBetsInfo,
} from '../../common/new-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { LimitBet } from '../../common/bet'
import { floatingEqual } from '../../common/util/math'
import { redeemShares } from './redeem-shares'
import { log } from './utils'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gte(1),
})

const binarySchema = z.object({
  outcome: z.enum(['YES', 'NO']),
  limitProb: z.number().gte(0.001).lte(0.999).optional(),
})

const freeResponseSchema = z.object({
  outcome: z.string(),
})

const numericSchema = z.object({
  outcome: z.string(),
  value: z.number(),
})

export const placebet = newEndpoint({}, async (req, auth) => {
  log('Inside endpoint handler.')
  const { amount, contractId } = validate(bodySchema, req.body)

  const result = await firestore.runTransaction(async (trans) => {
    log('Inside main transaction.')
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const [contractSnap, userSnap] = await trans.getAll(contractDoc, userDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    if (!userSnap.exists) throw new APIError(400, 'User not found.')
    log('Loaded user and contract snapshots.')

    const contract = contractSnap.data() as Contract
    const user = userSnap.data() as User
    if (user.balance < amount) throw new APIError(400, 'Insufficient balance.')

    const loanAmount = 0
    const { closeTime, outcomeType, mechanism, collectedFees, volume } =
      contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed.')

    const {
      newBet,
      newPool,
      newTotalShares,
      newTotalBets,
      newTotalLiquidity,
      newP,
      makers,
    } = await (async (): Promise<
      BetInfo & {
        makers?: maker[]
      }
    > => {
      if (
        (outcomeType == 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') &&
        mechanism == 'cpmm-1'
      ) {
        const { outcome, limitProb } = validate(binarySchema, req.body)

        const unfilledBetsSnap = await trans.get(
          getUnfilledBetsQuery(contractDoc)
        )
        const unfilledBets = unfilledBetsSnap.docs.map((doc) => doc.data())

        return getBinaryCpmmBetInfo(
          outcome,
          amount,
          contract,
          limitProb,
          unfilledBets
        )
      } else if (outcomeType == 'FREE_RESPONSE' && mechanism == 'dpm-2') {
        const { outcome } = validate(freeResponseSchema, req.body)
        const answerDoc = contractDoc.collection('answers').doc(outcome)
        const answerSnap = await trans.get(answerDoc)
        if (!answerSnap.exists) throw new APIError(400, 'Invalid answer')
        return getNewMultiBetInfo(outcome, amount, contract, loanAmount)
      } else if (outcomeType == 'NUMERIC' && mechanism == 'dpm-2') {
        const { outcome, value } = validate(numericSchema, req.body)
        return getNumericBetsInfo(value, outcome, amount, contract)
      } else {
        throw new APIError(500, 'Contract has invalid type/mechanism.')
      }
    })()
    log('Calculated new bet information.')

    if (
      mechanism == 'cpmm-1' &&
      (!newP ||
        !isFinite(newP) ||
        Math.min(...Object.values(newPool ?? {})) < CPMM_MIN_POOL_QTY)
    ) {
      throw new APIError(400, 'Bet too large for current liquidity pool.')
    }

    const betDoc = contractDoc.collection('bets').doc()
    trans.create(betDoc, { id: betDoc.id, userId: user.id, ...newBet })
    log('Created new bet document.')

    if (makers) {
      updateMakers(makers, betDoc.id, contractDoc, trans)
    }

    if (newBet.amount !== 0) {
      trans.update(userDoc, { balance: FieldValue.increment(-newBet.amount) })
      log('Updated user balance.')

      trans.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          p: newP,
          totalShares: newTotalShares,
          totalBets: newTotalBets,
          totalLiquidity: newTotalLiquidity,
          collectedFees: addObjects(newBet.fees, collectedFees),
          volume: volume + newBet.amount,
        })
      )
      log('Updated contract properties.')
    }

    return { betId: betDoc.id, makers, newBet }
  })

  log('Main transaction finished.')

  if (result.newBet.amount !== 0) {
    const userIds = uniq([
      auth.uid,
      ...(result.makers ?? []).map((maker) => maker.bet.userId),
    ])
    await Promise.all(userIds.map((userId) => redeemShares(userId, contractId)))
    log('Share redemption transaction finished.')
  }

  return { betId: result.betId }
})

const firestore = admin.firestore()

export const getUnfilledBetsQuery = (contractDoc: DocumentReference) => {
  return contractDoc
    .collection('bets')
    .where('isFilled', '==', false)
    .where('isCancelled', '==', false) as Query<LimitBet>
}

type maker = {
  bet: LimitBet
  amount: number
  shares: number
  timestamp: number
}
export const updateMakers = (
  makers: maker[],
  takerBetId: string,
  contractDoc: DocumentReference,
  trans: Transaction
) => {
  const makersByBet = groupBy(makers, (maker) => maker.bet.id)
  for (const makers of Object.values(makersByBet)) {
    const bet = makers[0].bet
    const newFills = makers.map((maker) => {
      const { amount, shares, timestamp } = maker
      return { amount, shares, matchedBetId: takerBetId, timestamp }
    })
    const fills = [...bet.fills, ...newFills]
    const totalShares = sumBy(fills, 'shares')
    const totalAmount = sumBy(fills, 'amount')
    const isFilled = floatingEqual(totalAmount, bet.orderAmount)

    log('Updated a matched limit order.')
    trans.update(contractDoc.collection('bets').doc(bet.id), {
      fills,
      isFilled,
      amount: totalAmount,
      shares: totalShares,
    })
  }

  // Deduct balance of makers.
  const spentByUser = mapValues(
    groupBy(makers, (maker) => maker.bet.userId),
    (makers) => sumBy(makers, (maker) => maker.amount)
  )
  for (const [userId, spent] of Object.entries(spentByUser)) {
    const userDoc = firestore.collection('users').doc(userId)
    trans.update(userDoc, { balance: FieldValue.increment(-spent) })
  }
}
