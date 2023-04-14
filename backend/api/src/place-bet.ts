import * as admin from 'firebase-admin'
import { z } from 'zod'
import {
  DocumentReference,
  FieldValue,
  Query,
  Transaction,
} from 'firebase-admin/firestore'
import { groupBy, mapValues, sumBy, uniq } from 'lodash'

import { APIError, authEndpoint, validate } from './helpers'
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
import { redeemShares } from './redeem-shares'
import { log } from 'shared/utils'
import { filterDefined } from 'common/util/array'
import { createLimitBetCanceledNotification } from 'shared/create-notification'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gte(1),
})

const binarySchema = z.object({
  outcome: z.enum(['YES', 'NO']),
  limitProb: z.number().gte(0).lte(1).optional(),
  expiresAt: z.number().optional(),
})

const freeResponseSchema = z.object({
  outcome: z.string(),
  shortSell: z.boolean().optional(),
})

const numericSchema = z.object({
  outcome: z.string(),
  value: z.number(),
})

export const placebet = authEndpoint(async (req, auth) => {
  log(`Inside endpoint handler for ${auth.uid}.`)
  const { amount, contractId } = validate(bodySchema, req.body)

  const result = await firestore.runTransaction(async (trans) => {
    log(`Inside main transaction for ${auth.uid}.`)
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const [contractSnap, userSnap] = await trans.getAll(contractDoc, userDoc)

    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    if (!userSnap.exists) throw new APIError(400, 'User not found.')

    const contract = contractSnap.data() as Contract
    const user = userSnap.data() as User
    if (user.balance < amount) throw new APIError(400, 'Insufficient balance.')
    log(
      `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
    )

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
        (outcomeType == 'BINARY' ||
          outcomeType === 'PSEUDO_NUMERIC' ||
          outcomeType === 'STONK') &&
        mechanism == 'cpmm-1'
      ) {
        // eslint-disable-next-line prefer-const
        let { outcome, limitProb, expiresAt } = validate(binarySchema, req.body)

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

        log(
          `Checking for limit orders in placebet for user ${auth.uid} on contract id ${contractId}.`
        )
        const { unfilledBets, balanceByUserId } =
          await getUnfilledBetsAndUserBalances(trans, contractDoc, auth.uid)

        return getBinaryCpmmBetInfo(
          outcome,
          amount,
          contract,
          limitProb,
          unfilledBets,
          balanceByUserId,
          expiresAt
        )
      } else if (outcomeType === 'MULTIPLE_CHOICE' && mechanism === 'cpmm-2') {
        const { outcome, shortSell } = validate(freeResponseSchema, req.body)
        if (isNaN(+outcome) || !contract.answers[+outcome])
          throw new APIError(400, 'Invalid answer')
        return getNewMultiCpmmBetInfo(contract, outcome, amount, !!shortSell)
      } else if (
        (outcomeType == 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE') &&
        mechanism == 'dpm-2'
      ) {
        const { outcome } = validate(freeResponseSchema, req.body)
        const answerDoc = contractDoc.collection('answers').doc(outcome)
        const answerSnap = await trans.get(answerDoc)
        if (!answerSnap.exists) throw new APIError(400, 'Invalid answer')
        return getNewMultiBetInfo(outcome, amount, contract)
      } else if (outcomeType == 'NUMERIC' && mechanism == 'dpm-2') {
        const { outcome, value } = validate(numericSchema, req.body)
        return getNumericBetsInfo(value, outcome, amount, contract)
      } else {
        throw new APIError(500, 'Contract has invalid type/mechanism.')
      }
    })()
    log(
      `Calculated new bet information for ${user.username} - auth ${auth.uid}.`
    )

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
    log(`Created new bet document for ${user.username} - auth ${auth.uid}.`)

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
    log(`Updated user ${user.username} balance - auth ${auth.uid}.`)

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
      log(`Updated contract ${contract.slug} properties - auth ${auth.uid}.`)
    }

    return { contract, betId: betDoc.id, makers, newBet, ordersToCancel, user }
  })

  log(`Main transaction finished - auth ${auth.uid}.`)

  const { contract, newBet, makers, ordersToCancel, user } = result
  const { mechanism } = contract

  if (
    (mechanism === 'cpmm-1' || mechanism === 'cpmm-2') &&
    newBet.amount !== 0
  ) {
    const userIds = uniq([
      auth.uid,
      ...(makers ?? []).map((maker) => maker.bet.userId),
    ])
    await Promise.all(userIds.map((userId) => redeemShares(userId, contract)))
    log(`Share redemption transaction finished - auth ${auth.uid}.`)
  }
  if (ordersToCancel) {
    await Promise.all(
      ordersToCancel.map((order) => {
        createLimitBetCanceledNotification(
          user,
          order.userId,
          order,
          makers?.find((m) => m.bet.id === order.id)?.amount ?? 0,
          contract
        )
      })
    )
  }

  return { ...newBet, betId: result.betId }
})

const firestore = admin.firestore()

const getUnfilledBetsQuery = (contractDoc: DocumentReference) => {
  return contractDoc
    .collection('bets')
    .where('isFilled', '==', false)
    .where('isCancelled', '==', false) as Query<LimitBet>
}

export const getUnfilledBetsAndUserBalances = async (
  trans: Transaction,
  contractDoc: DocumentReference,
  bettorId: string
) => {
  const unfilledBetsSnap = await trans.get(getUnfilledBetsQuery(contractDoc))
  const unfilledBets = unfilledBetsSnap.docs.map((doc) => doc.data())

  // Get balance of all users with open limit orders.
  const userIds = uniq(unfilledBets.map((bet) => bet.userId))
  const userDocs =
    userIds.length === 0
      ? []
      : await trans.getAll(
          ...userIds.map((userId) => {
            log(
              `Bettor ${bettorId} is checking balance of user ${userId} that has limit order on contract ${contractDoc.id}`
            )
            return firestore.doc(`users/${userId}`)
          })
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
