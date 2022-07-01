import * as admin from 'firebase-admin'
import { z } from 'zod'

import { APIError, newEndpoint, validate } from './api'
import { Contract, CPMM_MIN_POOL_QTY } from '../../common/contract'
import { User } from '../../common/user'
import {
  BetInfo,
  getBinaryCpmmBetInfo,
  getNewBinaryDpmBetInfo,
  getNewMultiBetInfo,
  getNumericBetsInfo,
} from '../../common/new-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { redeemShares } from './redeem-shares'
import { log } from './utils'
import { LimitBet } from 'common/bet'
import { Query } from 'firebase-admin/firestore'
import { sumBy } from 'lodash'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gte(1),
})

const binarySchema = z.object({
  outcome: z.enum(['YES', 'NO']),
  limitProb: z.number().gte(0).lte(1).optional(),
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
    const [contractSnap, userSnap] = await Promise.all([
      trans.get(contractDoc),
      trans.get(userDoc),
    ])
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
        makers?: {
          bet: LimitBet
          amount: number
          shares: number
        }[]
      }
    > => {
      if (outcomeType == 'BINARY' && mechanism == 'dpm-2') {
        const { outcome } = validate(binarySchema, req.body)
        return getNewBinaryDpmBetInfo(outcome, amount, contract, loanAmount)
      } else if (outcomeType == 'BINARY' && mechanism == 'cpmm-1') {
        const { outcome, limitProb } = validate(binarySchema, req.body)
        const boundedLimitProb = limitProb ?? (outcome === 'YES' ? 1 : 0)
        const unfilledBetsQuery = contractDoc
          .collection('bets')
          .where('outcome', '==', outcome === 'YES' ? 'NO' : 'YES')
          .where('isFilled', '==', false)
          .where('isCancelled', '==', false)
          .where('limitProb', outcome === 'YES' ? '<=' : '>=', boundedLimitProb)
          .orderBy('createdTime', 'desc')
          .orderBy(
            'limitProb',
            outcome === 'YES' ? 'asc' : 'desc'
          ) as Query<LimitBet>

        const unfilledBetsSnap = await trans.get(unfilledBetsQuery)
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

    const newBalance = user.balance - amount - loanAmount
    const betDoc = contractDoc.collection('bets').doc()
    trans.create(betDoc, { id: betDoc.id, userId: user.id, ...newBet })
    log('Created new bet document.')

    if (makers) {
      for (const maker of makers) {
        const { bet, amount, shares } = maker
        const newFill = { amount, shares, matchedBetId: betDoc.id }
        const fills = [...bet.fills, newFill]
        const totalShares = sumBy(fills, 'shares')
        const isFilled =
          Math.abs(sumBy(fills, 'amount') - bet.amount) < 0.0000001

        log('Updated a matched limit bet.')
        trans.update(contractDoc.collection('bets').doc(bet.id), {
          fills,
          isFilled,
          shares: totalShares,
        })
      }
    }

    trans.update(userDoc, { balance: newBalance })
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
        volume: volume + amount,
      })
    )
    log('Updated contract properties.')

    return { betId: betDoc.id }
  })

  log('Main transaction finished.')
  await redeemShares(auth.uid, contractId)
  log('Share redemption transaction finished.')
  return result
})

const firestore = admin.firestore()
