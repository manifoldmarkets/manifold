import { authEndpoint, validate } from './helpers'
import { updateUserDisinterestEmbeddingInternal } from 'shared/helpers/embeddings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'

const bodySchema = z.object({
  contractId: z.string(),
  creatorId: z.string(),
  feedId: z.number().optional(),
  removeContract: z.boolean().optional(),
})

export const updateUserDisinterestEmbedding = authEndpoint(
  async (req, auth) => {
    const pg = createSupabaseDirectClient()
    const { contractId, creatorId, feedId, removeContract } = validate(
      bodySchema,
      req.body
    )

    await updateUserDisinterestEmbeddingInternal(
      pg,
      auth.uid,
      contractId,
      creatorId,
      feedId,
      removeContract
    )
    return { success: true }
  }
)
