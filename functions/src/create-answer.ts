import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { getNewMultiBetInfo } from '../../common/new-bet'
import { Answer, MAX_ANSWER_LENGTH } from '../../common/answer'
import { getContract, getValues } from './utils'
import { sendNewAnswerEmail } from './emails'
import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  contractId: z.string().max(MAX_ANSWER_LENGTH),
  amount: z.number().gt(0),
  text: z.string(),
})

const opts = { secrets: ['MAILGUN_KEY'] }

export const createanswer = newEndpoint(opts, async (req, auth) => {
  const { contractId, amount, text } = validate(bodySchema, req.body)

  if (!isFinite(amount)) throw new APIError(400, 'Invalid amount')

  // Run as transaction to prevent race conditions.
  const answer = await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    if (user.balance < amount) throw new APIError(400, 'Insufficient balance')

    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
    const contract = contractSnap.data() as Contract

    if (contract.outcomeType !== 'FREE_RESPONSE')
      throw new APIError(400, 'Requires a free response contract')

    const { closeTime, volume } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed')

    const [lastAnswer] = await getValues<Answer>(
      firestore
        .collection(`contracts/${contractId}/answers`)
        .orderBy('number', 'desc')
        .limit(1)
    )

    if (!lastAnswer) throw new APIError(500, 'Could not fetch last answer')

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

    const loanAmount = 0

    const { newBet, newPool, newTotalShares, newTotalBets } =
      getNewMultiBetInfo(answerId, amount, contract, loanAmount)

    const newBalance = user.balance - amount
    const betDoc = firestore.collection(`contracts/${contractId}/bets`).doc()
    transaction.create(betDoc, {
      id: betDoc.id,
      userId: user.id,
      ...newBet,
    })
    transaction.update(userDoc, { balance: newBalance })
    transaction.update(contractDoc, {
      pool: newPool,
      totalShares: newTotalShares,
      totalBets: newTotalBets,
      answers: [...(contract.answers ?? []), answer],
      volume: volume + amount,
    })

    return answer
  })

  const contract = await getContract(contractId)

  if (answer && contract) await sendNewAnswerEmail(answer, contract)

  return answer
})

const firestore = admin.firestore()
