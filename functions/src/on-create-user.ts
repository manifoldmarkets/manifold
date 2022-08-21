import * as functions from 'firebase-functions'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

import { getPrivateUser } from './utils'
import { User } from 'common/user'
import {
  sendCreatorGuideEmail,
  sendInterestingMarketsEmail,
  sendPersonalFollowupEmail,
  sendWelcomeEmail,
} from './emails'
import { getTrendingContracts } from './weekly-markets-emails'

export const onCreateUser = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  .firestore.document('users/{userId}')
  .onCreate(async (snapshot) => {
    const user = snapshot.data() as User
    const privateUser = await getPrivateUser(user.id)
    if (!privateUser) return

    await sendWelcomeEmail(user, privateUser)

    const guideSendTime = dayjs().add(28, 'hours').toString()
    await sendCreatorGuideEmail(user, privateUser, guideSendTime)

    const followupSendTime = dayjs().add(48, 'hours').toString()
    await sendPersonalFollowupEmail(user, privateUser, followupSendTime)

    // skip email if weekly email is about to go out
    const day = dayjs().utc().day()
    if (day === 0 || (day === 1 && dayjs().utc().hour() <= 19)) return

    const contracts = await getTrendingContracts()
    const marketsSendTime = dayjs().add(24, 'hours').toString()

    await sendInterestingMarketsEmail(
      user,
      privateUser,
      contracts,
      marketsSendTime
    )
  })
