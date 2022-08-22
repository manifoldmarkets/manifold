import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { getAllPrivateUsers } from './utils'

export const resetWeeklyEmailsFlag = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  // every Monday at 1 am PT (UTC -07:00) ( 12 hours before the emails will be sent)
  .pubsub.schedule('0 7 * * 1')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    const privateUsers = await getAllPrivateUsers()
    // get all users that haven't unsubscribed from weekly emails
    const privateUsersToSendEmailsTo = privateUsers.filter((user) => {
      return !user.unsubscribedFromWeeklyTrendingEmails
    })
    const firestore = admin.firestore()
    await Promise.all(
      privateUsersToSendEmailsTo.map(async (user) => {
        return firestore.collection('private-users').doc(user.id).update({
          weeklyTrendingEmailSent: false,
        })
      })
    )
  })
