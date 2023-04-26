import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUsersCardViewEmbeddings } from 'shared/helpers/embeddings'

export const updateCardViewEmbeddings = functions.runWith({
  secrets,
  timeoutSeconds: 540,
}).pubsub
  // Run every day at midnight.
  .schedule('0 0 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    const pg = createSupabaseDirectClient()
    await updateUsersCardViewEmbeddings(pg)
    console.log('Completed updateCardViewEmbeddings')
  })
