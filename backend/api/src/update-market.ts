import { APIError, authEndpoint, validate } from 'api/helpers'
import { getContractSupabase } from 'shared/utils'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { removeUndefinedProps } from 'common/util/object'
import { buildArray } from 'common/util/array'
import { recordContractEdit } from 'shared/record-contract-edit'

const bodySchema = z
  .object({
    contractId: z.string(),
    visibility: z.enum(['unlisted', 'public']).optional(),
    closeTime: z.number().optional(),
  })
  .strict()

export const updatemarket = authEndpoint(async (req, auth, log) => {
  const { contractId, visibility, closeTime } = validate(bodySchema, req.body)
  if (!visibility && !closeTime)
    throw new APIError(400, 'Must provide visibility or closeTime')
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
    })
  )
  if (closeTime) {
    await firestore.doc(`contracts/${contractId}`).update({
      closeTime,
    })
    log('updated close time')
  }
  if (visibility) {
    await firestore.doc(`contracts/${contractId}`).update(
      removeUndefinedProps({
        unlistedById: visibility === 'unlisted' ? auth.uid : undefined,
        visibility,
      })
    )
    log('updated visibility')
  }
  await recordContractEdit(
    contract,
    auth.uid,
    buildArray([visibility && 'visibility', closeTime && 'closeTime'])
  )
  return { success: true }
})
const firestore = admin.firestore()
