import * as functions from 'firebase-functions'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

import { getPrivateUser } from './utils'
import { User } from 'common/user'
import { sendWelcomeEmail } from './emails'

export const onCreateUser = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  .firestore.document('users/{userId}')
  .onCreate(async (snapshot) => {
    const user = snapshot.data() as User
    const privateUser = await getPrivateUser(user.id)
    if (!privateUser) return

    await sendWelcomeEmail(user, privateUser)
  })
