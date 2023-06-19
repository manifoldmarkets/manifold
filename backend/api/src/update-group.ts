import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers'

const schema = z.object({
  id: z.string(),
  pinnedItems: z
    .array(
      z.object({
        itemId: z.string(),
        type: z.enum(['post', 'contract']),
      })
    )
    .optional(),
  aboutPostId: z.string().optional(),
  bannerUrl: z.string().optional(),
})

export const updategroup = authEndpoint(async (req) => {
  const { id, ...data } = validate(schema, req.body)
  const db = createSupabaseDirectClient()
  await updateData(db, 'posts', id, data)
  return { satus: 'success' }
})
