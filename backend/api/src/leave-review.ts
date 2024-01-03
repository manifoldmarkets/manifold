import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { contentSchema } from 'common/api/zod-types'
import { createMarketReviewedNotification } from 'shared/create-notification'
import { User } from 'common/user'
import { Contract } from 'common/contract'
import { parseJsonContentToText } from 'common/util/parse'

const schema = z
  .object({
    marketId: z.string(),
    review: contentSchema.optional(),
    rating: z.number().gte(0).lte(5).int(),
  })
  .strict()

export const leavereview = authEndpoint(async (req, auth) => {
  const { marketId, review, rating } = validate(schema, req.body)
  const db = createSupabaseClient()

  const { data, error } = await db
    .from('contracts')
    .select('*')
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

  const userData = await db
    .from('users')
    .select('data')
    .eq('id', auth.uid)
    .single()

  if (userData.error) {
    throw new APIError(500, `Error fetching creator`)
  }
  const reviewer = userData.data.data as User
  if (reviewer.isBannedFromPosting) {
    throw new APIError(403, `You are banned`)
  }

  await db.from('reviews').upsert({
    market_id: marketId,
    reviewer_id: auth.uid,
    vendor_id: creatorId,
    rating,
    content: review,
  })
  const contract = data.data as Contract

  await createMarketReviewedNotification(
    creatorId,
    reviewer,
    contract,
    rating,
    parseJsonContentToText(review ?? ''),
    createSupabaseDirectClient()
  )

  return { success: true }
})
