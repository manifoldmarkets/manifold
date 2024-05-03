import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import { getNewMultiBetInfo } from 'common/new-bet'
import { DpmAnswer } from 'common/answer'
import { getUser, getValues } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { addUserToContractFollowers } from 'shared/follow-market'
import { createNewAnswerOnContractNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { incrementBalance } from 'shared/supabase/users'

export const createAnswerDpm: APIHandler<'createanswer'> = async (
  body,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const { contractId, amount, text } = body

  // Run as transaction to prevent race conditions.
  const { answer, user, contract } = await pg.tx(async (tx) => {
    const user = await getUser(auth.uid, tx)
    if (!user) throw new APIError(401, 'Account not found')
    if (user.isBannedFromPosting) throw new APIError(403, 'You are banned')
    if (user.balance < amount) throw new APIError(403, 'Insufficient balance')

    await incrementBalance(tx, user.id, { balance: -amount })

    const { answer, contract } = await firestore.runTransaction(
      async (transaction) => {
        const contractDoc = firestore.doc(`contracts/${contractId}`)
        const contractSnap = await transaction.get(contractDoc)
        if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
        const contract = contractSnap.data() as Contract

        if (contract.outcomeType !== 'FREE_RESPONSE')
          throw new APIError(403, 'Requires a free response contract')

        const { closeTime, volume } = contract
        if (closeTime && Date.now() > closeTime)
          throw new APIError(403, 'Trading is closed')

        const [lastAnswer] = await getValues<DpmAnswer>(
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

        const answer: DpmAnswer = {
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

        const { newBet, newPool, newTotalShares, newTotalBets } =
          getNewMultiBetInfo(answerId, amount, contract)

        const betDoc = firestore
          .collection(`contracts/${contractId}/bets`)
          .doc()
        transaction.create(betDoc, {
          id: betDoc.id,
          userId: user.id,
          ...newBet,
        })
        transaction.update(contractDoc, {
          pool: newPool,
          totalShares: newTotalShares,
          totalBets: newTotalBets,
          answers: [...(contract.answers ?? []), answer],
          volume: volume + amount,
        })

        return { answer, user, contract }
      }
    )
    return { answer, user, contract }
  })

  const continuation = async () => {
    await addUserToContractFollowers(contractId, auth.uid)
    await createNewAnswerOnContractNotification(
      answer.id,
      user,
      answer.text,
      contract
    )
  }
  return { result: { answer }, continue: continuation }
}

const firestore = admin.firestore()
