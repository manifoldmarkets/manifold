import * as admin from 'firebase-admin'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { getPrivateUser } from 'shared/utils'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const bodySchema = z.object({
  discordId: z.string(),
}).strict()

export const registerdiscordid = authEndpoint(async (req, auth) => {
  const { discordId } = validate(bodySchema, req.body)
  const firestore = admin.firestore()
  const update = await firestore
    .collection('private-users')
    .doc(auth.uid)
    .update({
      discordId,
    })

  const privateUser = await getPrivateUser(auth.uid)
  if (!privateUser) throw new Error('No private user found')
  let apiKey = privateUser.apiKey
  if (!apiKey) {
    apiKey = randomUUID()
    await firestore.collection('private-users').doc(auth.uid).update({
      apiKey,
    })
  }
  const db = createSupabaseClient()
  const { error } = await db.from('discord_users').upsert({
    discord_user_id: discordId,
    api_key: apiKey,
    user_id: auth.uid,
  })
  if (error) throw new APIError(400, error.message)

  return { success: true, update }
})
