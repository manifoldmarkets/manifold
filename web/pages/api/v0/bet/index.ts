import { NextApiRequest, NextApiResponse } from 'next'

import * as admin from 'firebase-admin'
import { z } from 'zod'
import {
  DocumentReference,
  FieldValue,
  Query,
  Transaction,
} from 'firebase-admin/firestore'
import { groupBy, mapValues, sumBy, uniq } from 'lodash'

import { redeemShares } from 'functions/src/redeem-shares'
import { Contract, CPMM_MIN_POOL_QTY } from 'common/contract'
import { User } from 'common/user'
import { FLAT_TRADE_FEE } from 'common/fees'
import {
  BetInfo,
  getBinaryCpmmBetInfo,
  getNewMultiBetInfo,
  getNewMultiCpmmBetInfo,
  getNumericBetsInfo,
} from 'common/new-bet'
import { addObjects, removeUndefinedProps } from 'common/util/object'
import { LimitBet } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { filterDefined } from 'common/util/array'
import { applyCorsHeaders } from 'web/lib/api/cors'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { verifyUserId } from 'web/lib/api/auth'
import { APIError } from 'common/api'
import { log, validate } from 'web/lib/api/utils'

export const config = { api: { bodyParser: true } }

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  try {
    await applyCorsHeaders(req, res, {
      origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
      methods: 'POST',
    })

    const userId = await verifyUserId(req)

    if (userId) {
      const result = await placeBet(req.body, userId)
      return res.status(200).json(result)
    }
  } catch (e) {
    if (e instanceof APIError) {
      return res.status(e.status).json({ error: e.message })
    }
    log.error('Error placing bet: ', e)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

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
  shortSell: z.boolean().optional(),
})

const numericSchema = z.object({
  outcome: z.string(),
  value: z.number(),
})

const placeBet = async (body: unknown, userId: string) => {
  log('Inside endpoint handler.')
  const { amount, contractId } = validate(bodySchema, body)

  const result = await firestore.runTransaction(async (trans) => {
    log('Inside main transaction.')
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${userId}`)
    const [[contractSnap, userSnap], { unfilledBets, balanceByUserId }] =
      await Promise.all([
        trans.getAll(contractDoc, userDoc),

        // Note: Used only for cpmm-1 markets, but harmless to get for all markets.
        getUnfilledBetsAndUserBalances(trans, contractDoc),
      ])

    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    if (!userSnap.exists) throw new APIError(400, 'User not found.')
    log('Loaded user and contract snapshots.')

    const contract = contractSnap.data() as Contract
    const user = userSnap.data() as User
    if (user.balance < amount) throw new APIError(400, 'Insufficient balance.')

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
      ordersToCancel,
    } = await (async (): Promise<
      BetInfo & {
        makers?: maker[]
        ordersToCancel?: LimitBet[]
      }
    > => {
      if (
        (outcomeType == 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') &&
        mechanism == 'cpmm-1'
      ) {
        // eslint-disable-next-line prefer-const
        let { outcome, limitProb } = validate(binarySchema, body)

        if (limitProb !== undefined && outcomeType === 'BINARY') {
          const isRounded = floatingEqual(
            Math.round(limitProb * 100),
            limitProb * 100
          )
          if (!isRounded)
            throw new APIError(
              400,
              'limitProb must be in increments of 0.01 (i.e. whole percentage points)'
            )

          limitProb = Math.round(limitProb * 100) / 100
        }

        return getBinaryCpmmBetInfo(
          outcome,
          amount,
          contract,
          limitProb,
          unfilledBets,
          balanceByUserId
        )
      } else if (outcomeType === 'MULTIPLE_CHOICE' && mechanism === 'cpmm-2') {
        const { outcome, shortSell } = validate(freeResponseSchema, body)
        if (isNaN(+outcome) || !contract.answers[+outcome])
          throw new APIError(400, 'Invalid answer')
        return getNewMultiCpmmBetInfo(contract, outcome, amount, !!shortSell)
      } else if (
        (outcomeType == 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE') &&
        mechanism == 'dpm-2'
      ) {
        const { outcome } = validate(freeResponseSchema, body)
        const answerDoc = contractDoc.collection('answers').doc(outcome)
        const answerSnap = await trans.get(answerDoc)
        if (!answerSnap.exists) throw new APIError(400, 'Invalid answer')
        return getNewMultiBetInfo(outcome, amount, contract)
      } else if (outcomeType == 'NUMERIC' && mechanism == 'dpm-2') {
        const { outcome, value } = validate(numericSchema, body)
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
      throw new APIError(400, 'Trade too large for current liquidity pool.')
    }

    const betDoc = contractDoc.collection('bets').doc()
    trans.create(betDoc, {
      id: betDoc.id,
      userId: user.id,
      userAvatarUrl: user.avatarUrl,
      userUsername: user.username,
      userName: user.name,
      ...newBet,
    })
    log('Created new bet document.')

    if (makers) {
      updateMakers(makers, betDoc.id, contractDoc, trans)
    }
    if (ordersToCancel) {
      for (const bet of ordersToCancel) {
        trans.update(contractDoc.collection('bets').doc(bet.id), {
          isCancelled: true,
        })
      }
    }

    const balanceChange =
      newBet.amount !== 0
        ? // quick bet
          newBet.amount + FLAT_TRADE_FEE
        : // limit order
          FLAT_TRADE_FEE

    trans.update(userDoc, { balance: FieldValue.increment(-balanceChange) })
    log('Updated user balance.')

    if (newBet.amount !== 0) {
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

    return { contract, betId: betDoc.id, makers, newBet }
  })

  log('Main transaction finished.')

  const { contract, newBet, makers } = result
  const { mechanism } = contract

  if (
    (mechanism === 'cpmm-1' || mechanism === 'cpmm-2') &&
    newBet.amount !== 0
  ) {
    const userIds = uniq([
      userId,
      ...(makers ?? []).map((maker) => maker.bet.userId),
    ])
    await Promise.all(userIds.map((userId) => redeemShares(userId, contract)))
    log('Share redemption transaction finished.')
  }

  return { betId: result.betId }
}

const firestore = admin.firestore()

const getUnfilledBetsQuery = (contractDoc: DocumentReference) => {
  return contractDoc
    .collection('bets')
    .where('isFilled', '==', false)
    .where('isCancelled', '==', false) as Query<LimitBet>
}

export const getUnfilledBetsAndUserBalances = async (
  trans: Transaction,
  contractDoc: DocumentReference
) => {
  const unfilledBetsSnap = await trans.get(getUnfilledBetsQuery(contractDoc))
  const unfilledBets = unfilledBetsSnap.docs.map((doc) => doc.data())

  // Get balance of all users with open limit orders.
  const userIds = uniq(unfilledBets.map((bet) => bet.userId))
  const userDocs =
    userIds.length === 0
      ? []
      : await trans.getAll(
          ...userIds.map((userId) => firestore.doc(`users/${userId}`))
        )
  const users = filterDefined(userDocs.map((doc) => doc.data() as User))
  const balanceByUserId = Object.fromEntries(
    users.map((user) => [user.id, user.balance])
  )

  return { unfilledBets, balanceByUserId }
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
