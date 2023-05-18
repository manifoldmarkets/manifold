import * as admin from 'firebase-admin'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  seen: z.boolean(),
}).strict()

export const markallnotifications = authEndpoint(async (req, auth) => {
  const { seen } = validate(bodySchema, req.body)
  const firestore = admin.firestore()
  const notifsColl = firestore
    .collection('users')
    .doc(auth.uid)
    .collection('notifications')
  const notifs = await notifsColl.where('isSeen', '==', !seen).select().get()
  const writer = firestore.bulkWriter()
  for (const doc of notifs.docs) {
    writer.update(doc.ref, {
      isSeen: seen,
      viewTime: FieldValue.serverTimestamp(),
    })
  }
  await writer.close()
  return { success: true, n: notifs.size }
})
