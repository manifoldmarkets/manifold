import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import * as admin from 'firebase-admin'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'

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
    // await addInterestingContractsToFeed(db, pg, true)
    await updateContractMetricsCore()
    // const userId = '6hHpzvRG0pMq8PNJs7RZj2qlZGn2'
    // await createLeagueChangedNotification(
    //   userId,
    //   {
    //     season: 1,
    //     division: 2,
    //     cohort: 'lala',
    //     rank: 1,
    //     created_time: new Date().toISOString(),
    //     mana_earned: 100,
    //     mana_earned_breakdown: { '1': 100 } as any,
    //     user_id: userId,
    //     rank_snapshot: 1,
    //   },
    //   { season: 2, division: 3, cohort: 'lala' },
    //   100,
    //   pg
    // )

    // const user = await getUser('hqdXgp0jK2YMMhPs067eFK4afEH3')
    // if (!user) return
    // const contract = await getContract('OMDk6mF7gC4YZEi1sdVa')
    // if (!contract) return

    // const maxOutcome = await getUserMostChangedPosition(
    //   user,
    //   contract,
    //   Date.now() - 1000,
    //   db
    // )
    // if (!maxOutcome) return
    // await addBetDataToUsersFeeds(
    //   contract,
    //   user,
    //   maxOutcome,
    //   crypto.randomUUID()
    // )
    //
    // console.log('max change', maxOutcome)
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
