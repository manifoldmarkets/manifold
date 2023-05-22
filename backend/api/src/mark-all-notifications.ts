import * as admin from 'firebase-admin'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z.object({
  seen: z.boolean(),
})

export const markallnotifications = authEndpoint(async (req, auth) => {
  // TODO: delete this firestore after moving notif writes over to supabase
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

  // TODO: This is all we'll need after moving rest of notifs to supabase
  const pg = createSupabaseDirectClient()
  await pg.none(
    `update user_notifications
     SET data = jsonb_set(data, '{isSeen}', 'true'::jsonb)
    where user_id = $1
    and to_jsonb(data->'isSeen') = 'false'`,
    [auth.uid]
  )

  return { success: true, n: notifs.size }
})
