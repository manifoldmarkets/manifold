import * as functions from 'firebase-functions'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

import { getPrivateUser, getTrendingContracts } from 'shared/utils'
import { User } from 'common/user'
import {
  sendCreatorGuideEmail,
  sendInterestingMarketsEmail,
  sendWelcomeEmail,
} from 'shared/emails'
import { secrets } from 'common/secrets'
import { addNewUserToLeague } from 'shared/generate-leagues'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { spiceUpNewUsersFeedBasedOnTheirInterests } from 'shared/supabase/users'

export const onCreateUser = functions
  .runWith({ secrets })
  .firestore.document('users/{userId}')
  .onCreate(async (snapshot) => {
    const user = snapshot.data() as User
    const privateUser = await getPrivateUser(user.id)
    if (!privateUser) return

    const pg = createSupabaseDirectClient()
    await addNewUserToLeague(pg, user.id)

    await sendWelcomeEmail(user, privateUser)

    const day = dayjs().utc().day()
    // skip email if weekly email is about to go out
    const shouldSkipWeeklyEmail =
      day === 0 || (day === 1 && dayjs().utc().hour() <= 19)
    if (!shouldSkipWeeklyEmail) {
      const contracts = await getTrendingContracts()
      const marketsSendTime = dayjs().add(24, 'hours').toString()

      await sendInterestingMarketsEmail(
        user,
        privateUser,
        contracts,
        marketsSendTime
      )
    }

    const guideSendTime = dayjs().add(48, 'hours').toString()
    await sendCreatorGuideEmail(user, privateUser, guideSendTime)

    await spiceUpNewUsersFeedBasedOnTheirInterests(user.id, pg)
  })
