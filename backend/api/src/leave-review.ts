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

  const contract = await db
    .from('contracts')
    .select('creator_id')
    .eq('id', marketId)
    .single()

  if (contract.error) {
    throw new APIError(404, `No market found with id ${marketId}`)
  }

  const creatorId = contract.data.creator_id
  if (!creatorId) {
    throw new APIError(500, `Market has no creator`)
  }

  if (creatorId === auth.uid) {
    throw new APIError(403, `You can't review your own market`)
  }

  const user = await db
    .from('users')
    .select('data')
    .eq('id', creatorId)
    .single()

  if (user.error) {
    throw new APIError(500, `Error fetching creator`)
  }

  if ((user.data as any).isBannedFromPosting) {
    throw new APIError(403, `You are banned`)
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
