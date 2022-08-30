import * as admin from 'firebase-admin'
import { z } from 'zod'

import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  userId: z.string(),
  twitchInfo: z.object({
    twitchName: z.string(),
    controlToken: z.string(),
  }),
})

const BOT_ID = 'BOT_ID'

export const savetwitchcredentials = newEndpoint({}, async (req, auth) => {
  if (auth.uid !== BOT_ID) throw new APIError(403, 'Invalid access credentials')

  const { userId, twitchInfo } = validate(bodySchema, req.body)
  await firestore.doc(`private-users/${userId}`).update({ twitchInfo })
  return { success: true }
})

const firestore = admin.firestore()
