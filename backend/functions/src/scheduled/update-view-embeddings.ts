import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUsersViewEmbeddings } from 'shared/helpers/embeddings'

export const updateViewEmbeddings = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .pubsub// Run every day at midnight.
  .schedule('0 0 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    const pg = createSupabaseDirectClient()
    await updateUsersViewEmbeddings(pg)
    console.log('Completed updateViewEmbeddings')
  })
