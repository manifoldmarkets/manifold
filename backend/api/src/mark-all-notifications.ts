import * as admin from 'firebase-admin'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z
  .object({
    seen: z.boolean(),
  })
  .strict()

export const markallnotifications = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `update user_notifications
     SET data = jsonb_set(data, '{isSeen}', 'true'::jsonb)
    where user_id = $1
    and data->>'isSeen' = 'false'`,
    [auth.uid]
  )

  return { success: true }
})
