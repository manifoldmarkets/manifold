import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { createSupabaseClient } from 'shared/supabase/init'

const clearLoverPhotoSchema = z.object({
  loverId: z.number(),
})

export const clearLoverPhoto = authEndpoint(async (req, auth, log) => {
  const { loverId } = validate(clearLoverPhotoSchema, req.body)
  const db = createSupabaseClient()
  const lover = await db
    .from('lovers')
    .select('user_id')
    .eq('id', loverId)
    .single()
  if (!lover || !lover.data) {
    throw new APIError(400, `Lover ${loverId} not found.`)
  }
  if (lover.data.user_id !== auth.uid) {
    throw new APIError(403, `You do not own lover ${loverId}.`)
  }

  log('deleting pinned_url of ' + loverId)
  await db.from('lovers').update({ pinned_url: null }).eq('id', loverId)

  return { status: 'success' }
})
