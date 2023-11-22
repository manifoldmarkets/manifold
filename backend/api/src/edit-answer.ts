import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract } from 'common/contract'
import { Answer, MAX_ANSWER_LENGTH } from 'common/answer'
import { APIError, authEndpoint, validate } from './helpers'
import { isAdminId, isModId } from 'common/envs/constants'
import { recordContractEdit } from 'shared/record-contract-edit'
import { HOUR_MS } from 'common/util/time'

const bodySchema = z
  .object({
    contractId: z.string().max(MAX_ANSWER_LENGTH),
    answerId: z.string().max(MAX_ANSWER_LENGTH),
    text: z.string().min(1).max(MAX_ANSWER_LENGTH),
  })
  .strict()
const firestore = admin.firestore()

export const editanswercpmm = authEndpoint(async (req, auth, log) => {
  const { contractId, answerId, text } = validate(bodySchema, req.body)
  log('Received', {
    contractId,
    answerId,
    text,
  })

  const contractDoc = firestore.doc(`contracts/${contractId}`)

  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
  const contract = contractSnap.data() as Contract

  if (contract.mechanism !== 'cpmm-multi-1')
    throw new APIError(403, 'Requires a cpmm multiple choice contract')

  const { closeTime } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Cannot edit answer after market closes')

  const answerDoc = firestore
    .collection(`contracts/${contractId}/answersCpmm/`)
    .doc(answerId)

  const answerSnap = await answerDoc.get()
  if (!answerSnap.exists)
    throw new APIError(404, 'Answer with that id not found')

  const answer = answerSnap.data() as Answer
  if (answer.resolution)
    throw new APIError(403, 'Cannot edit answer that is already resolved')

  if (
    answer.userId === auth.uid &&
    answer.userId !== contract.creatorId &&
    !isModId(auth.uid) &&
    !isAdminId(auth.uid) &&
    answer.createdTime < Date.now() - HOUR_MS
  )
    throw new APIError(
      403,
      'Answerer can only edit answer within 1 hour of creation'
    )

  if (
    answer.userId !== auth.uid &&
    contract.creatorId !== auth.uid &&
    !isAdminId(auth.uid) &&
    !isModId(auth.uid)
  )
    throw new APIError(403, 'Contract owner, mod, or answer owner required')
  const answers = contract.answers.map((answer) =>
    answer.id === answerId
      ? {
          ...answer,
          text,
        }
      : answer
  )

  await answerDoc.update({
    text: text,
  })
  await contractDoc.update({
    answers,
  })

  await recordContractEdit(contract, auth.uid, ['answers'])

  return { status: 'success' }
})
