import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getPrivateUser } from 'shared/utils'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { updatePrivateUser } from 'shared/supabase/users'
import { upsert } from 'shared/supabase/utils'

const bodySchema = z
  .object({
    discordId: z.string(),
  })
  .strict()

export const registerdiscordid = authEndpoint(async (req, auth) => {
  const { discordId } = validate(bodySchema, req.body)
  const pg = createSupabaseDirectClient()

  await updatePrivateUser(pg, auth.uid, { discordId })

  const privateUser = await getPrivateUser(auth.uid)
  if (!privateUser) throw new APIError(500, 'No private user found')
  let apiKey = privateUser.apiKey
  if (!apiKey) {
    apiKey = randomUUID()
    await updatePrivateUser(pg, auth.uid, { apiKey })
  }

  await upsert(pg, 'discord_users', 'user_id', {
    discord_user_id: discordId,
    api_key: apiKey,
    user_id: auth.uid,
  })

  return { success: true }
})
