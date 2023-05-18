import * as admin from 'firebase-admin'
import { z } from 'zod'

import { authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  twitchInfo: z.object({
    twitchName: z.string(),
    controlToken: z.string(),
  }).strict(),
}).strict()

export const savetwitchcredentials = authEndpoint(async (req, auth) => {
  const { twitchInfo } = validate(bodySchema, req.body)
  const userId = auth.uid

  await firestore.doc(`private-users/${userId}`).update({ twitchInfo })
  return { success: true }
})

const firestore = admin.firestore()
