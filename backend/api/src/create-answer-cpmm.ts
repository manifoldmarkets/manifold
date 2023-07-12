import * as admin from 'firebase-admin'
import { z } from 'zod'
import { sumBy } from 'lodash'

import { Contract } from 'common/contract'
import { User } from 'common/user'
import { getBetDownToOneMultiBetInfo } from 'common/new-bet'
import { Answer, MAX_ANSWER_LENGTH } from 'common/answer'
import { APIError, authEndpoint, validate } from './helpers'
import { ANSWER_COST } from 'common/economy'
import { randomString } from 'common/util/random'
import { getUnfilledBetsAndUserBalances, updateMakers } from './place-bet'
import { FieldValue } from 'firebase-admin/firestore'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { removeUndefinedProps } from 'common/util/object'

const bodySchema = z.object({
  contractId: z.string().max(MAX_ANSWER_LENGTH),
  text: z.string().min(1).max(MAX_ANSWER_LENGTH),
})

export const createanswercpmm = authEndpoint(async (req, auth) => {
  const { contractId, text } = validate(bodySchema, req.body)
  console.log('Received', contractId, text)

  // Run as transaction to prevent race conditions.
  const answer = await firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
    const contract = contractSnap.data() as Contract

    if (contract.mechanism !== 'cpmm-multi-1')
      throw new APIError(400, 'Requires a cpmm multiple choice contract')

    const { closeTime } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed')

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

    const id = randomString()

    const newAnswerDoc = firestore
      .collection(`contracts/${contractId}/answersCpmm`)
      .doc(id)

    const n = answers.length
    // Bonus YES shares b/c if this resolves to YES, we don't have to pay out yes shares of previous answers,
    // but we do have to pay out NO shares in one more of the previous answers.
    const bonusYesShares =
      (n * ANSWER_COST) / 2 - (n * ANSWER_COST) / 2 / (n - 1)
    const poolYes = ANSWER_COST + bonusYesShares
    const poolNo = ANSWER_COST

    const answer: Answer = {
      id,
      index: n,
      contractId,
      createdTime: Date.now(),
      userId: user.id,
      text,
      poolYes,
      poolNo,
      prob: poolNo / (poolYes + poolNo),
      totalLiquidity: ANSWER_COST,
      subsidyPool: 0,
    }

    const answersWithNewAnswer = [...answers, answer]
    const { unfilledBets, balanceByUserId } =
      await getUnfilledBetsAndUserBalances(transaction, contractDoc, user.id)

    const { betResults, extraMana } = getBetDownToOneMultiBetInfo(
      contract,
      answersWithNewAnswer,
      unfilledBets,
      balanceByUserId
    )

    console.log('New answer', answer)
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

    transaction.create(newAnswerDoc, answer)

    for (const result of betResults) {
      const { answer, bet, cpmmState, makers, ordersToCancel } = result
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

    transaction.update(userDoc, { balance: FieldValue.increment(-ANSWER_COST) })

    transaction.update(contractDoc, {
      answers: answersWithNewAnswer,
    })

    return answer
  })

  return answer
})

const firestore = admin.firestore()
