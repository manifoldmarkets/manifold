import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import * as admin from 'firebase-admin'
import { getUserMostChangedPosition } from 'common/supabase/bets'
import { getContract, getUser } from 'shared/utils'
import { addBetDataToUsersFeeds } from 'shared/create-feed'
import * as crypto from 'crypto'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    const firestore = admin.firestore()
    // await updateViewsAndViewersEmbeddings(pg)
    // await addInterestingContractsToFeed(db, pg)
    // await sendOnboardingNotificationsInternal(firestore)
    // await addInterestingContractsToFeed(db, pg)
    const user = await getUser('AJwLWoo3xue32XIiAVrL5SyR1WB2')
    if (!user) return
    const contract = await getContract('sUfRsm6efdkUIOYcU980')
    if (!contract) return
    const maxOutcome = await getUserMostChangedPosition(
      user,
      contract,
      Date.now() - 1000,
      db
    )
    if (!maxOutcome) return
    await addBetDataToUsersFeeds(
      contract,
      user,
      maxOutcome,
      crypto.randomUUID()
    )

    console.log('max change', maxOutcome)
    // await calculateGroupImportanceScore(pg)
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
