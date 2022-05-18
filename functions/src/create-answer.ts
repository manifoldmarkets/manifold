import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract, DPM, FreeResponse, FullContract } from 'common/contract'
import { User } from 'common/user'
import { getNewMultiBetInfo } from 'common/new-bet'
import { Answer, MAX_ANSWER_LENGTH } from 'common/answer'
import { getContract, getValues } from './utils'
import { sendNewAnswerEmail } from './emails'
import { Bet } from '../../common/bet'

export const createAnswer = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      contractId: string
      amount: number
      text: string
    },
    context
  ) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const { contractId, amount, text } = data

    if (amount <= 0 || isNaN(amount) || !isFinite(amount))
      return { status: 'error', message: 'Invalid amount' }

    if (!text || typeof text !== 'string' || text.length > MAX_ANSWER_LENGTH)
      return { status: 'error', message: 'Invalid text' }

    // Run as transaction to prevent race conditions.
    const result = await firestore.runTransaction(async (transaction) => {
      const userDoc = firestore.doc(`users/${userId}`)
      const userSnap = await transaction.get(userDoc)
      if (!userSnap.exists)
        return { status: 'error', message: 'User not found' }
      const user = userSnap.data() as User

      if (user.balance < amount)
        return { status: 'error', message: 'Insufficient balance' }

      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await transaction.get(contractDoc)
      if (!contractSnap.exists)
        return { status: 'error', message: 'Invalid contract' }
      const contract = contractSnap.data() as Contract

      if (contract.outcomeType !== 'FREE_RESPONSE')
        return {
          status: 'error',
          message: 'Requires a free response contract',
        }

      const { closeTime, volume } = contract
      if (closeTime && Date.now() > closeTime)
        return { status: 'error', message: 'Trading is closed' }

      const yourBetsSnap = await transaction.get(
        contractDoc.collection('bets').where('userId', '==', userId)
      )
      const yourBets = yourBetsSnap.docs.map((doc) => doc.data() as Bet)

      const [lastAnswer] = await getValues<Answer>(
        firestore
          .collection(`contracts/${contractId}/answers`)
          .orderBy('number', 'desc')
          .limit(1)
      )

      if (!lastAnswer)
        return { status: 'error', message: 'Could not fetch last answer' }

      const number = lastAnswer.number + 1
      const id = `${number}`

      const newAnswerDoc = firestore
        .collection(`contracts/${contractId}/answers`)
        .doc(id)

      const answerId = newAnswerDoc.id
      const { username, name, avatarUrl } = user

      const answer: Answer = {
        id,
        number,
        contractId,
        createdTime: Date.now(),
        userId: user.id,
        username,
        name,
        avatarUrl,
        text,
      }
      transaction.create(newAnswerDoc, answer)

      const newBetDoc = firestore
        .collection(`contracts/${contractId}/bets`)
        .doc()

      const loanAmount = 0 // getLoanAmount(yourBets, amount)

      const { newBet, newPool, newTotalShares, newTotalBets, newBalance } =
        getNewMultiBetInfo(
          user,
          answerId,
          amount,
          contract as FullContract<DPM, FreeResponse>,
          loanAmount,
          newBetDoc.id
        )

      transaction.create(newBetDoc, newBet)
      transaction.update(contractDoc, {
        pool: newPool,
        totalShares: newTotalShares,
        totalBets: newTotalBets,
        answers: [...(contract.answers ?? []), answer],
        volume: volume + amount,
      })

      if (!isFinite(newBalance)) {
        throw new Error('Invalid user balance for ' + user.username)
      }

      transaction.update(userDoc, { balance: newBalance })

      return { status: 'success', answerId, betId: newBetDoc.id, answer }
    })

    const { answer } = result
    const contract = await getContract(contractId)

    if (answer && contract) await sendNewAnswerEmail(answer, contract)

    return result
  }
)

const firestore = admin.firestore()
