import * as functions from 'firebase-functions'

import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { processNews } from 'shared/process-news'
import { secrets } from 'common/secrets'

export const pollNews = functions
  .runWith({
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()

    const apiKey = process.env.NEWS_API_KEY
    if (!apiKey) {
      throw new Error('Missing NEWS_API_KEY')
    }

    console.log('Polling news...')
    await processNews(apiKey, db, pg)
  })
