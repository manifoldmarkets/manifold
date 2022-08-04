import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as dayjs from 'dayjs'

import { getPrivateUser } from './utils'
import { sendOneWeekBonusEmail } from './emails'
import { User } from 'common/user'

export const manabonusemail = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  .pubsub.schedule('0 9 * * 1-7')
  .onRun(async () => {
    await sendOneWeekEmails()
  })

const firestore = admin.firestore()

async function sendOneWeekEmails() {
  const oneWeekAgo = dayjs().subtract(1, 'week').valueOf()
  const twoWeekAgo = dayjs().subtract(2, 'weeks').valueOf()

  const userDocs = await firestore
    .collection('users')
    .where('createdTime', '<=', oneWeekAgo)
    .get()

  for (const user of userDocs.docs.map((d) => d.data() as User)) {
    if (user.createdTime < twoWeekAgo) continue

    const privateUser = await getPrivateUser(user.id)
    if (!privateUser || privateUser.manaBonusEmailSent) continue

    await firestore
      .collection('private-users')
      .doc(user.id)
      .update({ manaBonusEmailSent: true })

    console.log('sending m$ bonus email to', user.username)
    await sendOneWeekBonusEmail(user, privateUser)
    return
  }
}
