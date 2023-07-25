import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { processNews } from 'shared/process-news'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    // await addInterestingContractsToFeed(db, pg)
    // await calculateGroupImportanceScore(pg)

    const apiKey = process.env.NEWS_API_KEY
    if (!apiKey) {
      throw new Error('Missing NEWS_API_KEY')
    }

    console.log('Polling news...')
    await processNews(apiKey, db, pg, true)
  } catch (e) {
    console.error(e)
  }
}
