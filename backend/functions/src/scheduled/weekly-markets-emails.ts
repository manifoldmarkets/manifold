import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import { getAllPrivateUsersNotSent, getUser, log } from 'shared/utils'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { secrets } from 'common/secrets'
import { PrivateUser } from 'common/user'
import {
  getInterestingMarketsForUsers,
  USERS_TO_EMAIL,
} from 'shared/interesting-markets-email-helpers'

// This should work until we have 60k users subscribed to trending_markets and not opted out
export const weeklyMarketsEmails = functions
  .runWith({ secrets, memory: '2GB', timeoutSeconds: 540 })
  // every minute on Monday for 2 hours starting at 12pm PT
  .pubsub.schedule('* 12-13 * * 1')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    const privateUsers = await getAllPrivateUsersNotSent(
      'weeklyTrendingEmailSent',
      'trending_markets'
    )

    const privateUsersToSendEmailsTo = privateUsers
      // Get all users that haven't unsubscribed from weekly emails
      .filter(
        (user) =>
          !user.notificationPreferences.opt_out_all.includes('email') &&
          user.email
      )
      .slice(0, USERS_TO_EMAIL) // Send the emails out in batches
    const { contractsToSend } = await getInterestingMarketsForUsers(
      privateUsersToSendEmailsTo,
      admin.firestore()
    )
    let sent = 0
    await Promise.all(
      privateUsers.map(async (pu) =>
        sendEmailToPrivateUser(pu, contractsToSend[pu.id])
          .then(() =>
            log('sent email to', pu.email, ++sent, '/', USERS_TO_EMAIL)
          )
          .catch((e) => log('error sending email', e))
      )
    )
  })

const sendEmailToPrivateUser = async (
  privateUser: PrivateUser,
  contractsToSend: Contract[]
) => {
  const user = await getUser(privateUser.id)
  if (!user) return
  await sendInterestingMarketsEmail(user, privateUser, contractsToSend)
}
