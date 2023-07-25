import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { freeQuestionRemaining, getCurrentUtcTime } from 'common/user'
import { DAY_MS } from 'common/util/time'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    // await addInterestingContractsToFeed(db, pg)
    // await calculateGroupImportanceScore(pg)
    const currentTime = getCurrentUtcTime()
    console.log('time', currentTime)
    const fq = freeQuestionRemaining(0, Date.now() - DAY_MS * 3 + 1000)
    console.log('free q?', fq)
    // const apiKey = process.env.NEWS_API_KEY
    // if (!apiKey) {
    //   throw new Error('Missing NEWS_API_KEY')
    // }
    //
    // console.log('Polling news...')
    // await processNews(apiKey, db, pg, true)
  } catch (e) {
    console.error(e)
  }
}
