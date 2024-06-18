import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateViewsAndViewersEmbeddings } from 'shared/helpers/embeddings'
import { invokeFunction } from 'shared/utils'
import { onRequest } from 'firebase-functions/v2/https'

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

export const updatecontractviewembeddings = onRequest(
  { timeoutSeconds: 3600, memory: '4GiB', secrets },
  async (_req, res) => {
    const pg = createSupabaseDirectClient()
    await updateViewsAndViewersEmbeddings(pg)
    res.status(200).json({ success: true })
  }
)
