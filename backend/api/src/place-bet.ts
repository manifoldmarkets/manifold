import * as admin from 'firebase-admin'
import {
  DocumentReference,
  FieldValue,
  Query,
  Transaction,
} from 'firebase-admin/firestore'
import { groupBy, mapValues, sumBy, uniq } from 'lodash'

import { APIError, type APIHandler } from './helpers/endpoint'
import { Contract, CPMM_MIN_POOL_QTY } from 'common/contract'
import { User } from 'common/user'
import {
  BetInfo,
  CandidateBet,
  getBinaryCpmmBetInfo,
  getNewMultiBetInfo,
  getNewMultiCpmmBetInfo,
} from 'common/new-bet'
import { addObjects, removeUndefinedProps } from 'common/util/object'
import { Bet, LimitBet } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { redeemShares } from './redeem-shares'
import { GCPLog } from 'shared/utils'
import { filterDefined } from 'common/util/array'
import { createLimitBetCanceledNotification } from 'shared/create-notification'
import { Answer } from 'common/answer'
import { CpmmState, getCpmmProbability } from 'common/calculate-cpmm'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBet } from 'api/on-create-bet'
import { BLESSED_BANNED_USER_IDS } from 'common/envs/constants'

export const placeBet: APIHandler<'bet'> = async (props, auth, { log }) => {
  const isApi = auth.creds.kind === 'key'
  return await placeBetMain(props, auth.uid, isApi, log)
}

// Note: this returns a continuation function that should be run for consistency.
export const placeBetMain = async (
  body: ValidatedAPIParams<'bet'>,
  uid: string,
  isApi: boolean,
  log: GCPLog
) => {
  const { amount, contractId, replyToCommentId } = body

  const result = await firestore.runTransaction(async (trans) => {
    log(`Inside main transaction for ${uid}.`)
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${uid}`)
    const [contractSnap, userSnap] = await trans.getAll(contractDoc, userDoc)

    if (!contractSnap.exists) throw new APIError(404, 'Contract not found.')
    if (!userSnap.exists) throw new APIError(404, 'User not found.')

    const contract = contractSnap.data() as Contract
    const user = userSnap.data() as User
    if (user.balance < amount) throw new APIError(403, 'Insufficient balance.')
    if (
      (user.isBannedFromPosting || user.userDeleted) &&
      !BLESSED_BANNED_USER_IDS.includes(uid)
    ) {
      throw new APIError(403, 'You are banned or deleted. And not #blessed.')
    }
    log(
      `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
    )

    const { closeTime, outcomeType, mechanism, collectedFees, volume } =
      contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed.')

    const {
      newBet,
      otherBetResults,
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
        otherBetResults?: {
          answer: Answer
          bet: CandidateBet<Bet>
          cpmmState: CpmmState
          makers: maker[]
          ordersToCancel: LimitBet[]
        }[]
      }
    > => {
      if (
        (outcomeType == 'BINARY' ||
          outcomeType === 'PSEUDO_NUMERIC' ||
          outcomeType === 'STONK') &&
        mechanism == 'cpmm-1'
      ) {
        // eslint-disable-next-line prefer-const
        let { outcome, limitProb, expiresAt } = body
        if (expiresAt && expiresAt < Date.now())
          throw new APIError(400, 'Bet cannot expire in the past.')

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
          `Checking for limit orders in placebet for user ${uid} on contract id ${contractId}.`
        )
        const { unfilledBets, balanceByUserId } =
          await getUnfilledBetsAndUserBalances(trans, contractDoc)

        return getBinaryCpmmBetInfo(
          contract,
          outcome,
          amount,
          limitProb,
          unfilledBets,
          balanceByUserId,
          expiresAt
        )
      } else if (
        (outcomeType == 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE') &&
        mechanism == 'dpm-2'
      ) {
        if (!body.answerId) {
          throw new APIError(400, 'answerId must be specified for multi bets')
        }

        const { answerId } = body
        const answerDoc = contractDoc.collection('answers').doc(answerId)
        const answerSnap = await trans.get(answerDoc)
        if (!answerSnap.exists) throw new APIError(404, 'Answer not found')
        return getNewMultiBetInfo(answerId, amount, contract)
      } else if (
        outcomeType === 'MULTIPLE_CHOICE' &&
        mechanism == 'cpmm-multi-1'
      ) {
        const { shouldAnswersSumToOne } = contract
        if (!body.answerId) {
          throw new APIError(400, 'answerId must be specified for multi bets')
        }

        const { answerId, outcome, limitProb, expiresAt } = body
        if (expiresAt && expiresAt < Date.now())
          throw new APIError(403, 'Bet cannot expire in the past.')
        const answersSnap = await trans.get(
          contractDoc.collection('answersCpmm')
        )
        const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
        const answer = answers.find((a) => a.id === answerId)
        if (!answer) throw new APIError(404, 'Answer not found')
        if ('resolution' in answer && answer.resolution)
          throw new APIError(403, 'Answer is resolved and cannot be bet on')
        if (shouldAnswersSumToOne && answers.length < 2)
          throw new APIError(
            403,
            'Cannot bet until at least two answers are added.'
          )

        let roundedLimitProb = limitProb
        if (limitProb !== undefined) {
          const isRounded = floatingEqual(
            Math.round(limitProb * 100),
            limitProb * 100
          )
          if (!isRounded)
            throw new APIError(
              400,
              'limitProb must be in increments of 0.01 (i.e. whole percentage points)'
            )

          roundedLimitProb = Math.round(limitProb * 100) / 100
        }

        const { unfilledBets, balanceByUserId } =
          await getUnfilledBetsAndUserBalances(
            trans,
            contractDoc,
            // Fetch all limit orders if answers should sum to one.
            shouldAnswersSumToOne ? undefined : answerId
          )

        return getNewMultiCpmmBetInfo(
          contract,
          answers,
          answer,
          outcome,
          amount,
          roundedLimitProb,
          unfilledBets,
          balanceByUserId,
          expiresAt
        )
      } else {
        throw new APIError(
          400,
          'Contract type/mechanism not supported (or is no longer)'
        )
      }
    })()
    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)

    if (
      mechanism == 'cpmm-1' &&
      (!newP ||
        !isFinite(newP) ||
        Math.min(...Object.values(newPool ?? {})) < CPMM_MIN_POOL_QTY)
    ) {
      throw new APIError(403, 'Trade too large for current liquidity pool.')
    }

    // Special case for relationship markets.
    if (
      contract.isLove &&
      newPool &&
      contract.outcomeType === 'MULTIPLE_CHOICE'
    ) {
      const answer = contract.answers.find((a) => a.id === newBet.answerId) as
        | Answer
        | undefined
      if (
        user.id === contract.creatorId ||
        (answer && user.id === answer.loverUserId)
      ) {
        throw new APIError(
          403,
          'You cannot bet on your own relationship market.'
        )
      }
      const prob = getCpmmProbability(newPool, 0.5)
      if (prob < 0.02) {
        throw new APIError(
          403,
          'Minimum of 2% probability in relationship markets.'
        )
      }
    }
    // Special case for relationship markets. (Old markets.)
    if (contract.loverUserId1 && newPool) {
      if (contract.outcomeType === 'BINARY') {
        // Binary relationship markets deprecated.
        const prob = getCpmmProbability(newPool, newP ?? 0.5)
        if (prob < 0.01) {
          throw new APIError(
            403,
            'Minimum of 1% probability in relationship markets.'
          )
        }
      } else if (contract.outcomeType === 'MULTIPLE_CHOICE') {
        const prob = getCpmmProbability(newPool, 0.5)
        if (prob < 0.05) {
          throw new APIError(
            403,
            'Minimum of 5% probability in relationship markets.'
          )
        }
      }
    }

    const betDoc = contractDoc.collection('bets').doc()

    trans.create(
      betDoc,
      removeUndefinedProps({
        id: betDoc.id,
        userId: user.id,
        userAvatarUrl: user.avatarUrl,
        userUsername: user.username,
        userName: user.name,
        isApi,
        replyToCommentId,
        ...newBet,
      })
    )
    log(`Created new bet document for ${user.username} - auth ${uid}.`)

    if (makers) {
      updateMakers(makers, betDoc.id, contractDoc, trans, log)
    }
    if (ordersToCancel) {
      for (const bet of ordersToCancel) {
        trans.update(contractDoc.collection('bets').doc(bet.id), {
          isCancelled: true,
        })
      }
    }

    trans.update(userDoc, { balance: FieldValue.increment(-newBet.amount) })
    log(`Updated user ${user.username} balance - auth ${uid}.`)

    if (newBet.amount !== 0) {
      if (newBet.answerId) {
        // Multi-cpmm-1 contract
        trans.update(
          contractDoc,
          removeUndefinedProps({
            volume: volume + newBet.amount,
          })
        )
        if (newPool) {
          const { YES: poolYes, NO: poolNo } = newPool
          const prob = getCpmmProbability(newPool, 0.5)
          trans.update(
            contractDoc.collection('answersCpmm').doc(newBet.answerId),
            removeUndefinedProps({
              poolYes,
              poolNo,
              prob,
            })
          )
        }
      } else {
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
      }

      if (otherBetResults) {
        for (const result of otherBetResults) {
          const { answer, bet, cpmmState, makers, ordersToCancel } = result
          const { probBefore, probAfter } = bet
          const smallEnoughToIgnore =
            probBefore < 0.001 &&
            probAfter < 0.001 &&
            Math.abs(probAfter - probBefore) < 0.00001

          if (!smallEnoughToIgnore || Math.random() < 0.01) {
            const betDoc = contractDoc.collection('bets').doc()
            trans.create(betDoc, {
              id: betDoc.id,
              userId: user.id,
              userAvatarUrl: user.avatarUrl,
              userUsername: user.username,
              userName: user.name,
              isApi,
              ...bet,
            })
            const { YES: poolYes, NO: poolNo } = cpmmState.pool
            const prob = getCpmmProbability(cpmmState.pool, 0.5)
            trans.update(
              contractDoc.collection('answersCpmm').doc(answer.id),
              removeUndefinedProps({
                poolYes,
                poolNo,
                prob,
              })
            )
          }
          updateMakers(makers, betDoc.id, contractDoc, trans, log)
          for (const bet of ordersToCancel) {
            trans.update(contractDoc.collection('bets').doc(bet.id), {
              isCancelled: true,
            })
          }
        }
      }

      log(`Updated contract ${contract.slug} properties - auth ${uid}.`)
    }

    return { newBet, betId: betDoc.id, contract, makers, ordersToCancel, user }
  })

  log(`Main transaction finished - auth ${uid}.`)

  const { newBet, betId, contract, makers, ordersToCancel, user } = result
  const { mechanism } = contract

  if (
    (mechanism === 'cpmm-1' || mechanism === 'cpmm-multi-1') &&
    newBet.amount !== 0
  ) {
    const userIds = uniq([
      uid,
      ...(makers ?? []).map((maker) => maker.bet.userId),
    ])
    await Promise.all(
      userIds.map((userId) => redeemShares(userId, contract, log))
    )
    log(`Share redemption transaction finished - auth ${uid}.`)
  }

  const continuation = async () => {
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
    const bet = await firestore
      .doc(`contracts/${contract.id}/bets/${betId}`)
      .get()
    await onCreateBet(bet.data() as Bet, contract, user, log)
  }

  return {
    result: { ...newBet, betId },
    continue: continuation,
  }
}

const firestore = admin.firestore()

const getUnfilledBetsQuery = (
  contractDoc: DocumentReference,
  answerId?: string
) => {
  const q = contractDoc
    .collection('bets')
    .where('isFilled', '==', false)
    .where('isCancelled', '==', false) as Query<LimitBet>
  if (answerId) {
    return q.where('answerId', '==', answerId)
  }
  return q
}

export const getUnfilledBetsAndUserBalances = async (
  trans: Transaction,
  contractDoc: DocumentReference,
  answerId?: string
) => {
  const unfilledBetsSnap = await trans.get(
    getUnfilledBetsQuery(contractDoc, answerId)
  )
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
  trans: Transaction,
  log: GCPLog
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
