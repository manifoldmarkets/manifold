import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insert } from 'shared/supabase/utils'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers/endpoint'

const bodySchema = z
  .object({
    topic: z.string(),
  })
  .strict()

export const saveTopic = authEndpoint(async (req) => {
  const { topic } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()
  const response = pg.oneOrNone(
    'select * from topic_embeddings where topic = $1',
    topic
  )

  const hasTopic = !!response

  if (!hasTopic) {
    const embedding = await generateEmbeddings(topic)

    if (!embedding || embedding.length < 1500) {
      console.log('No embeddings for', topic)
      return {
        status: 'error',
        message: 'Embedding generation failed',
      }
    } else {
      console.log('Generated embeddings for', topic)

      await insert(pg, 'topic_embeddings', {
        topic,
        embedding: embedding as any,
      })
    }
  }
  return {
    status: 'success',
  }
})
