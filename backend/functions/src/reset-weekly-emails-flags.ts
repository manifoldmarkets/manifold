import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { getAllPrivateUsers } from 'shared/utils'

export const resetWeeklyEmailsFlags = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '4GB',
  })
  .pubsub // every Monday at 12 am PT (UTC -07:00) ( 12 hours before the emails will be sent)
  .schedule('0 7 * * 1')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    const privateUsers = await getAllPrivateUsers()
    const firestore = admin.firestore()
    await Promise.all(
      privateUsers.map(async (user) => {
        return firestore.collection('private-users').doc(user.id).update({
          weeklyTrendingEmailSent: false,
          weeklyPortfolioUpdateEmailSent: false,
        })
      })
    )
  })
