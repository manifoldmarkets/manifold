import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { z } from 'zod'
import * as admin from 'firebase-admin'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { isAdminId } from 'common/envs/constants'
const bodySchema = z
  .object({
    userId: z.string(),
    unban: z.boolean().optional(),
  })
  .strict()
export const banuser = authEndpoint(async (req, auth, log) => {
  const { userId, unban } = validate(bodySchema, req.body)
  await throwErrorIfNotMod(auth.uid)
  if (isAdminId(userId)) throw new APIError(403, 'Cannot ban admin')
  await trackPublicEvent(auth.uid, 'ban user', {
    userId,
  })
  await firestore.doc(`users/${userId}`).update({
    isBannedFromPosting: !unban,
  })
  log('updated user')
  return { success: true }
})
const firestore = admin.firestore()
