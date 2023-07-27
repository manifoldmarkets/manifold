import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import {
  getDefaultEmbedding,
  updateViewsAndViewersEmbeddings,
} from 'shared/helpers/embeddings'
import { invokeFunction } from 'shared/utils'
import { onRequest } from 'firebase-functions/v2/https'
import { DEFAULT_USER_FEED_ID } from 'common/feed'

export const updateContractViewEmbeddings = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .pubsub // Run every day at midnight.
  .schedule('0 0 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updatecontractviewembeddings'))
    } catch (e) {
      console.error(e)
    }
  })

export const updateDefaultUserEmbedding = functions
  .runWith({ secrets })
  .pubsub // Run every hour.
  .schedule('0 * * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    const pg = createSupabaseDirectClient()
    await upsertDefaultUserEmbedding(DEFAULT_USER_FEED_ID, pg)
  })

export const updatecontractviewembeddings = onRequest(
  { timeoutSeconds: 3600, memory: '512MiB', secrets },
  async (_req, res) => {
    const pg = createSupabaseDirectClient()
    await updateViewsAndViewersEmbeddings(pg)
    res.status(200).json({ success: true })
  }
)

async function upsertDefaultUserEmbedding(
  userId: string,
  pg: SupabaseDirectClient
): Promise<void> {
  const embed = await getDefaultEmbedding(pg)

  await pg.none(
    `insert into user_embeddings (user_id, interest_embedding)
            values ($1, $2)
            on conflict (user_id)
            do update set
            interest_embedding = $2
            `,
    [userId, embed]
  )
}
