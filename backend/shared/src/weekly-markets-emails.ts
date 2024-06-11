import { chunk } from 'lodash'

import { getPrivateUsersNotSent, getUser, isProd, log } from 'shared/utils'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { PrivateUser } from 'common/user'
import { getForYouSQL } from 'shared/supabase/search-contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { userIdsToAverageTopicConversionScores } from 'shared/topic-interests'

// Run every minute on Monday for 3 hours starting at 12pm PT.
// Should scale until at least 1000 * 120 = 120k users signed up for emails (70k at writing)
const EMAILS_PER_BATCH = 1000
export async function sendWeeklyMarketsEmails() {
  if (!isProd()) return
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

  const CHUNK_SIZE = 50
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

  const contractsToSend = await getForYouMarkets(user.id, 6, privateUser)
  await sendInterestingMarketsEmail(user, privateUser, contractsToSend)
  if (userIdsToAverageTopicConversionScores[user.id]) {
    delete userIdsToAverageTopicConversionScores[user.id]
  }
}

export async function getForYouMarkets(
  userId: string,
  limit: number,
  privateUser: PrivateUser
) {
  const searchMarketSQL = await getForYouSQL(
    userId,
    'open',
    'ALL',
    limit,
    0,
    'score',
    false,
    '00000',
    privateUser,
    200
  )
  const pg = createSupabaseDirectClient()
  const contracts = await pg.map(searchMarketSQL, [], (r) => convertContract(r))

  return contracts ?? []
}
