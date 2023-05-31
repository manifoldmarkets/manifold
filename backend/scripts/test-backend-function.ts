import { getLocalEnv, initAdmin } from 'shared/init-admin'
initAdmin()
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import * as admin from 'firebase-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { processNews } from 'shared/process-news'
const firestore = admin.firestore()

async function testScheduledFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    // const pg = createSupabaseDirectClient()
    // await addContractsWithLargeProbChangesToFeed()
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()

    const apiKey = process.env.NEWS_API_KEY
    if (!apiKey) {
      throw new Error('Missing NEWS_API_KEY')
    }

    console.log('Polling news...')
    await processNews(apiKey, db, pg)
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) testScheduledFunction().then(() => process.exit())
