import { APIError, authEndpoint, validate } from 'api/helpers'
import { getContractSupabase } from 'shared/utils'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { removeUndefinedProps } from 'common/util/object'
import { recordContractEdit } from 'shared/record-contract-edit'
import { MAX_QUESTION_LENGTH } from 'common/contract'

const bodySchema = z
  .object({
    contractId: z.string(),
    visibility: z.enum(['unlisted', 'public']).optional(),
    closeTime: z.number().optional(),
    addAnswersMode: z.enum(['ONLY_CREATOR', 'ANYONE']).optional(),
    question: z.string().min(1).max(MAX_QUESTION_LENGTH).optional(),
  })
  .strict()

export const updatemarket = authEndpoint(async (req, auth, log) => {
  const { contractId, visibility, addAnswersMode, closeTime, question } =
    validate(bodySchema, req.body)
  if (!visibility && !closeTime && !addAnswersMode && !question)
    throw new APIError(
      400,
      'Must provide visibility, closeTime, question or add answers mode'
    )
  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  if (contract.creatorId !== auth.uid) await throwErrorIfNotMod(auth.uid)

  await trackPublicEvent(
    auth.uid,
    'update market',
    removeUndefinedProps({
      contractId,
      visibility,
      closeTime,
      addAnswersMode,
      question,
    })
  )
  if (closeTime) {
    await firestore.doc(`contracts/${contractId}`).update({
      closeTime,
    })
    log('updated close time')
    await recordContractEdit(contract, auth.uid, ['closeTime'])
  }
  if (visibility) {
    await firestore.doc(`contracts/${contractId}`).update(
      removeUndefinedProps({
        unlistedById: visibility === 'unlisted' ? auth.uid : undefined,
        visibility,
      })
    )
    log('updated visibility')
    await recordContractEdit(contract, auth.uid, ['visibility'])
  }
  if (addAnswersMode) {
    await firestore.doc(`contracts/${contractId}`).update({
      addAnswersMode,
    })
    log('updated add answers mode')
  }
  if (question) {
    await firestore.doc(`contracts/${contractId}`).update({
      question,
    })
    log('updated question')
    await recordContractEdit(contract, auth.uid, ['question'])
  }

  return { success: true }
})
const firestore = admin.firestore()
