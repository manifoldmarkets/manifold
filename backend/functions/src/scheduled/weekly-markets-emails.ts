import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { chunk } from 'lodash'

import { getPrivateUsersNotSent, getUser, log } from 'shared/utils'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { secrets } from 'common/secrets'
import { PrivateUser } from 'common/user'
import { getForYouMarkets } from 'shared/supabase/search-contracts'

// Run every minute on Monday for 2 hours starting at 12pm PT.
// Should scale until 1000 * 180 = 180k users
const EMAILS_PER_BATCH = 1000

export const weeklyMarketsEmails = functions
  .runWith({ secrets, memory: '4GB', timeoutSeconds: 540 })
  .pubsub.schedule('* 12-14 * * 1')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    const privateUsers = await getPrivateUsersNotSent(
      'weeklyTrendingEmailSent',
      'trending_markets',
      EMAILS_PER_BATCH
    )

    const CHUNK_SIZE = 25
    let i = 0
    const chunks = chunk(privateUsers, CHUNK_SIZE)
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (pu) =>
          sendEmailToPrivateUser(pu).catch((e) => log('error sending email', e))
        )
      )

      i++
      log(
        `Sent ${i * CHUNK_SIZE} of ${
          privateUsers.length
        } weekly trending emails in this batch`
      )
    }
  })

const sendEmailToPrivateUser = async (privateUser: PrivateUser) => {
  const user = await getUser(privateUser.id)
  if (!user) return

  await admin.firestore().collection('private-users').doc(user.id).update({
    weeklyTrendingEmailSent: true,
  })

  if (
    privateUser.notificationPreferences.opt_out_all.includes('email') ||
    !privateUser.email
  ) {
    // Skip if oupted out of all. But still mark it as sent to not mess up firestore query.
    return
  }

  const contractsToSend = await getForYouMarkets(user.id)
  await sendInterestingMarketsEmail(user, privateUser, contractsToSend)
}
