import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import * as admin from 'firebase-admin'
import { getContract, getUser } from 'shared/utils'
import { addBetDataToUsersFeeds } from 'shared/create-feed'
import { getUserMostChangedPosition } from 'common/supabase/bets'
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
    // await addInterestingContractsToFeed(db, pg, true)
    // await updateContractMetricsCore()
    // await updateUserMetricsCore()
    // await updateContractViews()
    // const comment = (
    //   await firestore
    //     .collection(`contracts/43xks1GGr9P5T42xndsX/comments`)
    //     .doc('hb6rCt2TCWjlwmiSVJKw')
    //     .get()
    // ).data() as ContractComment
    // const contract = (
    //   await firestore.collection('contracts').doc(comment.contractId).get()
    // ).data() as Contract
    // const commentCreator = (
    //   await firestore.collection(`users`).doc(comment.userId).get()
    // ).data() as User
    // await handleCommentNotifications(
    //   comment,
    //   contract,
    //   commentCreator,
    //   undefined,
    //   crypto.randomUUID()
    // )
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

    const user = await getUser('AJwLWoo3xue32XIiAVrL5SyR1WB2')
    if (!user) return
    const contract = await getContract('NtFRoxiF2Rfk4RM8KPRc')
    if (!contract) return
    // await addContractToFeed(
    //   contract,
    //   [
    //     'follow_user',
    //     'similar_interest_vector_to_contract',
    //     'contract_in_group_you_are_in',
    //   ],
    //   'new_contract',
    //   [user.id],
    //   {
    //     idempotencyKey: contract.id + '_new_contract',
    //   }
    // )

    const maxOutcome = await getUserMostChangedPosition(
      user,
      contract,
      Date.now() - 5000,
      db
    )
    if (!maxOutcome) return
    await addBetDataToUsersFeeds(
      contract.id,
      user,
      maxOutcome,
      crypto.randomUUID()
    )

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
