import { z } from 'zod'
import { authEndpoint, validate } from 'api/helpers'
import { createSupabaseClient } from 'shared/supabase/init'

const clearLoverPhotoSchema = z.object({
  loverId: z.number(),
})

export const clearLoverPhoto = authEndpoint(async (req, auth) => {
  const { loverId } = validate(clearLoverPhotoSchema, req.body)
  const db = createSupabaseClient()

  console.log('deleting pinned_url of', loverId)
  await db.from('lovers').update({ pinned_url: null }).eq('id', loverId)

  return { status: 'success' }
})
