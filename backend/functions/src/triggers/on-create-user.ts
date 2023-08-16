import * as functions from 'firebase-functions'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

import { getPrivateUser } from 'shared/utils'
import { User } from 'common/user'
import { sendWelcomeEmail } from 'shared/emails'
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

    await spiceUpNewUsersFeedBasedOnTheirInterests(user.id, pg)
  })
