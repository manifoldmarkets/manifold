import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { contentSchema } from 'shared/zod-types'

const schema = z.object({
  marketId: z.string(),
  review: contentSchema.optional(),
  rating: z.number().gte(0).lte(5).int(),
})

export const leavereview = authEndpoint(async (req, auth) => {
  const { marketId, review, rating } = validate(schema, req.body)
  const db = createSupabaseClient()

  const { data, error } = await db
    .from('contracts')
    .select('creator_id')
    .eq('id', marketId)
    .single()

  if (error) {
    throw new APIError(404, `No market found with id ${marketId}`)
  }

  const creatorId = data.creator_id
  if (!creatorId) {
    throw new APIError(500, `Market has no creator`)
  }

  if (creatorId === auth.uid) {
    throw new APIError(403, `You can't review your own market`)
  }

  // TODO: check that the user has bet in the market?

  await db.from('reviews').upsert({
    market_id: marketId,
    reviewer_id: auth.uid,
    vendor_id: creatorId,
    rating,
    content: review,
  })

  return { success: true }
})
