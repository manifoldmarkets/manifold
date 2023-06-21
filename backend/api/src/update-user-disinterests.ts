import { authEndpoint, validate } from './helpers'
import { updateUserDisinterestEmbeddingInternal } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { repopulateNewUsersFeedFromEmbeddings } from 'shared/supabase/users'
import { z } from 'zod'

const bodySchema = z.object({
  contractId: z.string(),
  creatorId: z.string(),
  feedId: z.number().optional(),
})

export const updateUserDisinterestEmbedding = authEndpoint(
  async (req, auth) => {
    const pg = createSupabaseDirectClient()
    const { contractId, creatorId, feedId } = validate(bodySchema, req.body)

    await updateUserDisinterestEmbeddingInternal(
      pg,
      auth.uid,
      contractId,
      creatorId,
      feedId
    )
    return { success: true }
  }
)
