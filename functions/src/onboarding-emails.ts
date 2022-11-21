import * as functions from 'firebase-functions'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

import * as admin from 'firebase-admin'
import { PrivateUser, User } from '../../common/user'
import {
  sendCreatorGuideEmail,
  sendInterestingMarketsEmail,
  sendPersonalFollowupEmail,
} from './emails'
import { getNotificationDestinationsForUser } from '../../common/user-notification-preferences'
import { getTrendingContracts } from './weekly-markets-emails'
const firestore = admin.firestore()

//TODO: We'll probably need a longer timeout for this function, so find out how to
// limit function calls via other backend functions only
// TODO2: we'll want to stop scheduling the other onboarding emails before this goes into action
export const onboardingEmails = functions
  .runWith({ secrets: ['MAILGUN_KEY'], timeoutSeconds: 540 })
  // run every day at 10am PST
  .pubsub.schedule('0 10 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    // Users created between 24-48 hours ago
    await send1DayInterestingMarketsEmails()
    // Users created between 48-72 hours ago
    await send2DayFollowupEmails()
    // Users created between 72-96 hours ago
    await send3DayCreatorGuideEmails()
  })

export const send2DayFollowupEmails = async () => {
  const { users, idToPrivateUsers } = await getUsersCreatedBetweenDays(2, 3)
  await Promise.all(
    users.map(async (user) => {
      const privateUser = idToPrivateUsers.get(user.id)
      if (!privateUser) return
      const { sendToEmail } = getNotificationDestinationsForUser(
        privateUser,
        'onboarding_flow'
      )
      if (sendToEmail) {
        console.log(`Sending 2 day followup email to ${user.id}`)
        await sendPersonalFollowupEmail(user, privateUser)
      }
    })
  )
}
export const send1DayInterestingMarketsEmails = async () => {
  // skip email if weekly email is about to go out
  const day = dayjs().utc().day()
  // don't run on sun or mon
  if (day === 0 || day === 1) return
  const contracts = await getTrendingContracts()
  const { users, idToPrivateUsers } = await getUsersCreatedBetweenDays(1, 2)
  await Promise.all(
    users.map(async (user) => {
      const privateUser = idToPrivateUsers.get(user.id)
      // If it's a wednesday we might get users created on monday that've already gotten the weekly email
      if (!privateUser || privateUser.weeklyTrendingEmailSent) return

      const { sendToEmail } = getNotificationDestinationsForUser(
        privateUser,
        'onboarding_flow'
      )
      if (sendToEmail) {
        console.log(`Sending 1 day interesting markets email to ${user.id}`)
        await sendInterestingMarketsEmail(user, privateUser, contracts)
      }
    })
  )
}

export const send3DayCreatorGuideEmails = async () => {
  const { users, idToPrivateUsers } = await getUsersCreatedBetweenDays(3, 4)
  await Promise.all(
    users.map(async (user) => {
      const privateUser = idToPrivateUsers.get(user.id)
      if (!privateUser) return
      const { sendToEmail } = getNotificationDestinationsForUser(
        privateUser,
        'onboarding_flow'
      )
      if (sendToEmail) {
        console.log(`Sending 3 day creator guide email to ${user.id}`)
        await sendCreatorGuideEmail(user, privateUser)
      }
    })
  )
}

const getUsersCreatedBetweenDays = async (
  minDaysAgo: number,
  maxDaysAgo: number
) => {
  // get users created earlier than 3 days ago and less than 1 day ago via ms since epoch
  const minDaysTime = dayjs().subtract(minDaysAgo, 'days').valueOf()
  const maxDaysTime = dayjs().subtract(maxDaysAgo, 'days').valueOf()

  console.log(
    `Getting users created between ${minDaysAgo} and ${maxDaysAgo} days ago`
  )
  const users = (
    await firestore
      .collection('users')
      .where('createdTime', '<', minDaysTime)
      .where('createdTime', '>', maxDaysTime)
      .get()
  ).docs.map((doc) => doc.data() as User)

  const usersAndPrivateUsersMap = new Map<string, PrivateUser>()
  await Promise.all(
    users.map(async (user) => {
      const privateUser = await firestore
        .collection('private-users')
        .doc(user.id)
        .get()
        .then((doc) => doc.data() as PrivateUser)
      usersAndPrivateUsersMap.set(user.id, privateUser)
    })
  )

  return { users, idToPrivateUsers: usersAndPrivateUsersMap }
}
