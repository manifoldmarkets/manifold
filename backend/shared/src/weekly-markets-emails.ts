import { chunk } from 'lodash'

import { getPrivateUsersNotSent, getUser, log } from 'shared/utils'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { PrivateUser } from 'common/user'
import { getForYouMarkets } from 'shared/supabase/search-contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Run every minute on Monday for 3 hours starting at 12pm PT.
// Should scale until at least 1000 * 180 = 180k users
const EMAILS_PER_BATCH = 1000
export async function sendWeeklyMarketsEmails() {
  const pg = createSupabaseDirectClient()
  const privateUsers = await getPrivateUsersNotSent(
    'trending_markets',
    EMAILS_PER_BATCH,
    pg
  )
  await pg.none(
    `update private_users set weekly_trending_email_sent = true where id = any($1)`,
    [privateUsers.map((u) => u.id)]
  )

  const CHUNK_SIZE = 250
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
}

const sendEmailToPrivateUser = async (privateUser: PrivateUser) => {
  const user = await getUser(privateUser.id)
  if (!user) return

  const contractsToSend = await getForYouMarkets(user.id)
  await sendInterestingMarketsEmail(user, privateUser, contractsToSend)
}
