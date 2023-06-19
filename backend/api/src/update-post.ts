import { authEndpoint, validate } from './helpers'
import { MAX_POST_TITLE_LENGTH } from 'common/post'
import { updateData } from 'shared/supabase/utils'
import { z } from 'zod'
import { contentSchema } from 'shared/zod-types'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const schema = z.object({
  id: z.string(),
  title: z.string().min(1).max(MAX_POST_TITLE_LENGTH).optional(),
  content: contentSchema.optional(),
})

export const updatepost = authEndpoint(async (req) => {
  const { id, ...data } = validate(schema, req.body)

  const db = createSupabaseDirectClient()
  await updateData(db, 'posts', id, data)
  return { satus: 'success' }
})
