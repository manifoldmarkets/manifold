import { mapValues, groupBy, sumBy, uniq } from 'lodash'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'

import { APIError, authEndpoint, validate } from './helpers'
import { Contract, CPMM_MIN_POOL_QTY } from 'common/contract'
import { User } from 'common/user'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { removeUndefinedProps } from 'common/util/object'
import { log } from 'shared/utils'
import { Bet } from 'common/bet'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import { getUnfilledBetsAndUserBalances, updateMakers } from './place-bet'
import { redeemShares } from './redeem-shares'
import { removeUserFromContractFollowers } from 'shared/follow-market'
import { Answer } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'

const bodySchema = z.object({
  contractId: z.string(),
  shares: z.number().positive().optional(), // leave it out to sell all shares
  outcome: z.enum(['YES', 'NO']).optional(), // leave it out to sell whichever you have
  answerId: z.string().optional(), // Required for multi binary markets
})

export const sellshares = authEndpoint(async (req, auth) => {
  const { contractId, shares, outcome, answerId } = validate(
    bodySchema,
    req.body
  )

  // Run as transaction to prevent race conditions.
  const result = await firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${auth.uid}`)
    let betsQ = contractDoc.collection('bets').where('userId', '==', auth.uid)
    if (answerId) {
      betsQ = betsQ.where('answerId', '==', answerId)
    }
    log(
      `Checking for limit orders and bets in sellshares for user ${auth.uid} on contract id ${contractId}.`
    )
    const [
      [contractSnap, userSnap],
      userBetsSnap,
      { unfilledBets, balanceByUserId },
    ] = await Promise.all([
      transaction.getAll(contractDoc, userDoc),
      transaction.get(betsQ),
      getUnfilledBetsAndUserBalances(transaction, contractDoc),
    ])
    if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const userBets = userBetsSnap.docs.map((doc) => doc.data() as Bet)

    const contract = contractSnap.data() as Contract
    const user = userSnap.data() as User

    const { closeTime, mechanism, volume } = contract

    if (mechanism !== 'cpmm-1' && mechanism !== 'cpmm-multi-1')
      throw new APIError(
        403,
        'You can only sell shares on cpmm-1 or cpmm-multi-1 contracts'
      )
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed.')

    const loanAmount = sumBy(userBets, (bet) => bet.loanAmount ?? 0)
    const betsByOutcome = groupBy(userBets, (bet) => bet.outcome)
    const sharesByOutcome = mapValues(betsByOutcome, (bets) =>
      sumBy(bets, (b) => b.shares)
    )

    let chosenOutcome: 'YES' | 'NO'
    if (outcome != null) {
      chosenOutcome = outcome
    } else {
      const nonzeroShares = Object.entries(sharesByOutcome).filter(
        ([_k, v]) => !floatingEqual(0, v)
      )
      if (nonzeroShares.length == 0) {
        throw new APIError(403, "You don't own any shares in this market.")
      }
      if (nonzeroShares.length > 1) {
        throw new APIError(
          400,
          `You own multiple kinds of shares, but did not specify which to sell.`
        )
      }
      chosenOutcome = nonzeroShares[0][0] as 'YES' | 'NO'
    }

    const maxShares = sharesByOutcome[chosenOutcome]
    const sharesToSell = shares ?? maxShares

    if (!maxShares)
      throw new APIError(
        403,
        `You don't have any ${chosenOutcome} shares to sell.`
      )

    if (!floatingLesserEqual(sharesToSell, maxShares))
      throw new APIError(400, `You can only sell up to ${maxShares} shares.`)

    const soldShares = Math.min(sharesToSell, maxShares)
    const saleFrac = soldShares / maxShares
    let loanPaid = saleFrac * loanAmount
    if (!isFinite(loanPaid)) loanPaid = 0

    const {
      newBet,
      newPool,
      newP,
      makers,
      ordersToCancel,
      otherResultsWithBet,
    } = await (async () => {
      if (mechanism === 'cpmm-1') {
        return {
          otherResultsWithBet: [],
          ...getCpmmSellBetInfo(
            soldShares,
            chosenOutcome,
            contract,
            unfilledBets,
            balanceByUserId,
            loanPaid
          ),
        }
      } else {
        const answersSnap = await transaction.get(
          contractDoc.collection('answersCpmm')
        )
        const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
        const answer = answers.find((a) => a.id === answerId)
        if (!answer) throw new APIError(404, 'Answer not found')
        if (answers.length < 2)
          throw new APIError(
            403,
            'Cannot bet until at least two answers are added.'
          )
        if (!contract.shouldAnswersSumToOne)
          throw new APIError(
            403,
            'Sorry, selling is not implemented yet for this market type. Please check back tomorrow!'
          )

        return {
          newP: 0.5,
          ...getCpmmMultiSellBetInfo(
            contract,
            answers,
            answer,
            soldShares,
            chosenOutcome,
            undefined,
            unfilledBets,
            balanceByUserId,
            loanPaid
          ),
        }
      }
    })()

    if (
      !newP ||
      !isFinite(newP) ||
      Math.min(...Object.values(newPool ?? {})) < CPMM_MIN_POOL_QTY
    ) {
      throw new APIError(403, 'Sale too large for current liquidity pool.')
    }

    const newBetDoc = firestore.collection(`contracts/${contractId}/bets`).doc()

    updateMakers(makers, newBetDoc.id, contractDoc, transaction)

    transaction.update(userDoc, {
      balance: FieldValue.increment(-newBet.amount + (newBet.loanAmount ?? 0)),
    })

    const isApi = auth.creds.kind === 'key'
    transaction.create(newBetDoc, {
      id: newBetDoc.id,
      userId: user.id,
      userAvatarUrl: user.avatarUrl,
      userUsername: user.username,
      userName: user.name,
      isApi,
      ...newBet,
    })

    for (const bet of ordersToCancel) {
      transaction.update(contractDoc.collection('bets').doc(bet.id), {
        isCancelled: true,
      })
    }

    if (mechanism === 'cpmm-1') {
      transaction.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          p: newP,
          volume: volume + Math.abs(newBet.amount),
        })
      )
    } else if (newBet.answerId) {
      transaction.update(
        contractDoc,
        removeUndefinedProps({
          volume: volume + Math.abs(newBet.amount),
        })
      )
      const prob = getCpmmProbability(newPool, 0.5)
      const { YES: poolYes, NO: poolNo } = newPool
      transaction.update(
        contractDoc.collection('answersCpmm').doc(newBet.answerId),
        removeUndefinedProps({
          poolYes,
          poolNo,
          prob,
        })
      )
    }

    for (const {
      answer,
      bet,
      cpmmState,
      makers,
      ordersToCancel,
    } of otherResultsWithBet) {
      const betDoc = contractDoc.collection('bets').doc()
      transaction.create(betDoc, {
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
      transaction.update(
        contractDoc.collection('answersCpmm').doc(answer.id),
        removeUndefinedProps({
          poolYes,
          poolNo,
          prob,
        })
      )
      updateMakers(makers, betDoc.id, contractDoc, transaction)
      for (const bet of ordersToCancel) {
        transaction.update(contractDoc.collection('bets').doc(bet.id), {
          isCancelled: true,
        })
      }
    }

    return {
      newBet,
      betId: newBetDoc.id,
      makers,
      maxShares,
      soldShares,
      contract,
      otherResultsWithBet,
    }
  })

  const {
    newBet,
    betId,
    makers,
    maxShares,
    soldShares,
    contract,
    otherResultsWithBet,
  } = result

  if (contract.mechanism === 'cpmm-1' && floatingEqual(maxShares, soldShares)) {
    await removeUserFromContractFollowers(contractId, auth.uid)
  }

  const allMakers = [...makers, ...otherResultsWithBet.flatMap((r) => r.makers)]
  const userIds = uniq(allMakers.map((maker) => maker.bet.userId))
  await Promise.all(userIds.map((userId) => redeemShares(userId, contract)))
  log('Share redemption transaction finished.')

  return { status: 'success', ...newBet, betId: betId }
})

const firestore = admin.firestore()
