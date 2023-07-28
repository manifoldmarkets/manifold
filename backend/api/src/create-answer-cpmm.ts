import * as admin from 'firebase-admin'
import { z } from 'zod'
import { groupBy, partition, sumBy } from 'lodash'

import { Contract } from 'common/contract'
import { User } from 'common/user'
import { CandidateBet, getBetDownToOneMultiBetInfo } from 'common/new-bet'
import {
  Answer,
  MAX_ANSWER_LENGTH,
  MAX_ANSWERS,
} from 'common/answer'
import { APIError, authEndpoint, validate } from './helpers'
import { ANSWER_COST } from 'common/economy'
import { randomString } from 'common/util/random'
import { getUnfilledBetsAndUserBalances, updateMakers } from './place-bet'
import { FieldValue } from 'firebase-admin/firestore'
import {
  addCpmmMultiLiquidity,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { isAdminId } from 'common/envs/constants'
import { Bet } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { noFees } from 'common/fees'

const bodySchema = z.object({
  contractId: z.string().max(MAX_ANSWER_LENGTH),
  text: z.string().min(1).max(MAX_ANSWER_LENGTH),
})

export const createanswercpmm = authEndpoint(async (req, auth) => {
  const { contractId, text } = validate(bodySchema, req.body)
  console.log('Received', contractId, text)

  // Run as transaction to prevent race conditions.
  const newAnswerId = await firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
    const contract = contractSnap.data() as Contract

    if (contract.mechanism !== 'cpmm-multi-1')
      throw new APIError(400, 'Requires a cpmm multiple choice contract')

    const { closeTime } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed')

    if (contract.creatorId !== auth.uid && !isAdminId(auth.uid)) {
      throw new APIError(
        400,
        'Only the creator or an admin can create an answer'
      )
    }

    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    if (user.balance < ANSWER_COST)
      throw new APIError(400, 'Insufficient balance, need M' + ANSWER_COST)

    const answersSnap = await transaction.get(
      firestore.collection(`contracts/${contractId}/answersCpmm`)
    )
    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
    const [otherAnswers, answersWithoutOther] = partition(
      answers,
      (a) => a.isOther
    )
    const otherAnswer = otherAnswers[0]
    if (!otherAnswer) {
      throw new APIError(
        400,
        '"Other" answer not found, and is required for adding new answers.'
      )
    }

    if (answers.length >= MAX_ANSWERS) {
      throw new APIError(
        400,
        `Cannot add an answer: Maximum number (${MAX_ANSWERS}) of answers reached.`
      )
    }

    const id = randomString()
    const newAnswerDoc = contractDoc.collection('answersCpmm').doc(id)

    const n = answers.length
    // 1. Add ANSWER_COST to otherAnswer's pool.
    // 2. Copy Yes shares into the new answer.
    // Yes shares can be copied because, conceptually, if the new answer is split out of Other,
    // then original yes shares in Other should pay out if either it or Other is chosen.
    // 3. Convert No shares in Other into Yes shares in all the previous answers. Then, convert
    // them back into equal No shares in the new answer and Other.
    // As a consequence, the new answer and other gain up to half the No shares in Other and
    // minus that many Yes shares.
    // 4. Probability sum is now greater than 1. Bet it down equally.
    // 5. Betting it down to 1 produces mana, which we then insert as subsidy.
    const otherYesShares = otherAnswer.poolYes + ANSWER_COST
    const otherNoShares = otherAnswer.poolNo + ANSWER_COST

    const noSharesConvertedBack = Math.min(
      otherNoShares / 2,
      otherYesShares - 1
    )
    const previousAnswersGainedYesShares =
      otherNoShares - noSharesConvertedBack * 2

    const poolYes = otherYesShares - noSharesConvertedBack
    const poolNo = noSharesConvertedBack
    const prob = poolNo / (poolYes + poolNo)

    const totalLiquidity = (otherAnswer.totalLiquidity + ANSWER_COST) / 2

    const newAnswer: Answer = {
      id,
      index: n - 1,
      contractId,
      createdTime: Date.now(),
      userId: user.id,
      text,
      isOther: false,
      poolYes,
      poolNo,
      prob,
      totalLiquidity,
      subsidyPool: 0,
    }

    const updatedOtherAnswerProps = {
      totalLiquidity,
      index: n,
    }

    const updatedOtherAnswer = {
      ...otherAnswer,
      ...updatedOtherAnswerProps,
      poolYes,
      poolNo,
      prob,
    }

    const updatedPreviousAnswers = answersWithoutOther.map((a) => ({
      ...a,
      poolYes: a.poolYes + previousAnswersGainedYesShares,
    }))

    const answersWithNewAnswer = [
      ...updatedPreviousAnswers,
      newAnswer,
      updatedOtherAnswer,
    ]
    const { unfilledBets, balanceByUserId } =
      await getUnfilledBetsAndUserBalances(transaction, contractDoc, user.id)

    // Cancel limit orders on Other answer.
    const [unfilledBetsOnOther, unfilledBetsExcludingOther] = partition(
      unfilledBets,
      (b) => b.answerId === otherAnswer.id
    )

    const { betResults, extraMana } = getBetDownToOneMultiBetInfo(
      contract,
      answersWithNewAnswer,
      unfilledBetsExcludingOther,
      balanceByUserId
    )

    console.log('New answer', newAnswer)
    console.log('Other answer', updatedOtherAnswer)
    console.log('extraMana', extraMana)
    console.log(
      'bet amounts',
      betResults.map((r) =>
        sumBy(r.takers.slice(0, r.takers.length - 1), (t) => t.amount)
      ),
      'shares',
      betResults.map((r) =>
        sumBy(r.takers.slice(0, r.takers.length - 1), (t) => t.shares)
      )
    )

    transaction.create(newAnswerDoc, newAnswer)
    transaction.update(
      contractDoc.collection('answersCpmm').doc(otherAnswer.id),
      updatedOtherAnswerProps
    )

    const poolsByAnswer = Object.fromEntries(
      betResults.map((r) => [
        r.answer.id,
        r.cpmmState.pool as { YES: number; NO: number },
      ])
    )
    for (const [answerId, pool] of Object.entries(poolsByAnswer)) {
      const { YES: poolYes, NO: poolNo } = pool
      const prob = poolNo / (poolYes + poolNo)
      console.log(
        'After arbitrage answer',
        newAnswer.text,
        'with',
        poolYes,
        poolNo,
        'prob',
        prob
      )
    }
    const newPoolsByAnswer = addCpmmMultiLiquidity(poolsByAnswer, extraMana)

    for (const result of betResults) {
      const { answer, bet, makers, ordersToCancel } = result
      const betDoc = contractDoc.collection('bets').doc()
      transaction.create(betDoc, {
        id: betDoc.id,
        userId: user.id,
        userAvatarUrl: user.avatarUrl,
        userUsername: user.username,
        userName: user.name,
        isApi: false,
        ...bet,
      })
      const pool = newPoolsByAnswer[answer.id]
      const { YES: poolYes, NO: poolNo } = pool
      const prob = getCpmmProbability(pool, 0.5)
      console.log(
        'Updating answer',
        answer.text,
        'with',
        poolYes,
        poolNo,
        'prob',
        prob
      )
      transaction.update(contractDoc.collection('answersCpmm').doc(answer.id), {
        poolYes,
        poolNo,
        prob,
      })
      updateMakers(makers, betDoc.id, contractDoc, transaction)
      for (const bet of ordersToCancel) {
        transaction.update(contractDoc.collection('bets').doc(bet.id), {
          isCancelled: true,
        })
      }
    }

    for (const bet of unfilledBetsOnOther) {
      transaction.update(contractDoc.collection('bets').doc(bet.id), {
        isCancelled: true,
      })
    }

    transaction.update(userDoc, { balance: FieldValue.increment(-ANSWER_COST) })
    return newAnswer.id
  })

  const answers = await convertOtherAnswerShares(contractId, newAnswerId)

  return { answer: answers.find((a) => a.id === newAnswerId)!, answers }
})

const firestore = admin.firestore()

async function convertOtherAnswerShares(
  contractId: string,
  newAnswerId: string
) {
  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    const now = Date.now()
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const answersSnap = await transaction.get(
      contractDoc.collection('answersCpmm').orderBy('index')
    )
    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
    const newAnswer = answers.find((a) => a.id === newAnswerId)!
    const otherAnswer = answers.find((a) => a.isOther)!

    const betsSnap = await transaction.get(
      contractDoc.collection('bets').where('answerId', '==', otherAnswer.id)
    )
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
    const betsByUserId = groupBy(bets, (b) => b.userId)

    // Gain YES shares in new answer for each YES share in Other.
    for (const [userId, bets] of Object.entries(betsByUserId)) {
      const position = sumBy(
        bets,
        (b) => b.shares * (b.outcome === 'YES' ? 1 : -1)
      )
      if (!floatingEqual(position, 0) && position > 0) {
        const betDoc = contractDoc.collection('bets').doc()
        const freeYesSharesBet: CandidateBet & { id: string; userId: string } =
          {
            id: betDoc.id,
            contractId,
            userId,
            answerId: newAnswer.id,
            outcome: 'YES',
            shares: position,
            amount: 0,
            isCancelled: false,
            isFilled: true,
            loanAmount: 0,
            probBefore: newAnswer.prob,
            probAfter: newAnswer.prob,
            createdTime: now,
            fees: noFees,
            isAnte: false,
            isRedemption: true,
            isChallenge: false,
            visibility: bets[0].visibility,
            isApi: false,
          }
        transaction.create(betDoc, freeYesSharesBet)
      }
    }

    // Convert NO shares in Other answer to YES shares in all other answers (excluding new answer).
    for (const [userId, bets] of Object.entries(betsByUserId)) {
      const noPosition = sumBy(
        bets,
        (b) => b.shares * (b.outcome === 'YES' ? -1 : 1)
      )
      if (!floatingEqual(noPosition, 0) && noPosition > 0) {
        const betDoc = contractDoc.collection('bets').doc()
        const convertNoSharesBet: CandidateBet & {
          id: string
          userId: string
        } = {
          id: betDoc.id,
          contractId,
          userId,
          answerId: otherAnswer.id,
          outcome: 'NO',
          shares: -noPosition,
          amount: 0,
          isCancelled: false,
          isFilled: true,
          loanAmount: 0,
          probBefore: otherAnswer.prob,
          probAfter: otherAnswer.prob,
          createdTime: now,
          fees: noFees,
          isAnte: false,
          isRedemption: true,
          isChallenge: false,
          visibility: bets[0].visibility,
          isApi: false,
        }
        transaction.create(betDoc, convertNoSharesBet)

        const previousAnswers = answers.filter(
          (a) => a.id !== newAnswer.id && a.id !== otherAnswer.id
        )
        for (const answer of previousAnswers) {
          const betDoc = contractDoc.collection('bets').doc()
          const gainYesSharesBet: CandidateBet & {
            id: string
            userId: string
          } = {
            id: betDoc.id,
            contractId,
            userId,
            answerId: answer.id,
            outcome: 'YES',
            shares: noPosition,
            amount: 0,
            isCancelled: false,
            isFilled: true,
            loanAmount: 0,
            probBefore: answer.prob,
            probAfter: answer.prob,
            createdTime: now,
            fees: noFees,
            isAnte: false,
            isRedemption: true,
            isChallenge: false,
            visibility: bets[0].visibility,
            isApi: false,
          }
          transaction.create(betDoc, gainYesSharesBet)
        }
      }
    }
    return answers
  })
}
