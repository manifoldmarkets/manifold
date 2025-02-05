import { chunk, first } from 'lodash'

import { getPrivateUsersNotSent, isProd, log } from 'shared/utils'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { PrivateUser } from 'common/user'
import { getForYouSQL } from 'shared/supabase/search-contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'
import { filterDefined } from 'common/util/array'

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
  log(`Found ${privateUsers.length} users to send emails to`)
  const userIds = privateUsers.map((u) => u.id)
  await pg.none(
    `update private_users set weekly_trending_email_sent = true where id = any($1)`,
    [userIds]
  )
  const userIdsSentEmails: string[] = []

  const CHUNK_SIZE = 25
  let i = 0
  try {
    const chunks = chunk(privateUsers, CHUNK_SIZE)
    await buildUserInterestsCache(privateUsers.map((u) => u.id))
    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(async (privateUser) => {
          const contractsToSend = await getForYouMarkets(
            privateUser.id,
            6,
            privateUser
          )
          // TODO: bulkify this
          await sendInterestingMarketsEmail(
            privateUser.name,
            privateUser,
            contractsToSend
          )
          if (userIdsToAverageTopicConversionScores[privateUser.id]) {
            delete userIdsToAverageTopicConversionScores[privateUser.id]
          }
          userIdsSentEmails.push(privateUser.id)
        })
      )
      const failed = results.filter((r) => r.status === 'rejected')
      if (failed.length > 0) {
        log.error(`Failed to send emails to ${failed.length} users`)
        log.error(`First failed: ${first(failed)}`)
      }

      i++
      log(
        `Sent ${i * CHUNK_SIZE} of ${
          privateUsers.length
        } weekly trending emails in this batch`
      )
    }
  } catch (e) {
    log.error(`Error sending weekly trending emails: ${e}`)
  }
  const userIdsNotSent = userIds.filter(
    (uid) => !userIdsSentEmails.includes(uid)
  )
  if (userIdsNotSent.length > 0) {
    log(`Resetting ${userIdsNotSent.length} users to not sent`)
    await pg.none(
      `update private_users set weekly_trending_email_sent = false where id = any($1)`,
      [userIdsNotSent]
    )
  }
}

export async function getForYouMarkets(
  userId: string,
  limit: number,
  privateUser: PrivateUser
) {
  const searchMarketSQL = await getForYouSQL({
    userId,
    filter: 'open',
    contractType: 'ALL',
    limit: limit * 2,
    offset: 0,
    sort: 'score',
    isPrizeMarket: false,
    marketTier: '00000',
    privateUser,
    token: 'ALL',
    threshold: 200,
  })

  const pg = createSupabaseDirectClient()
  const contracts = await pg.map(searchMarketSQL, [], (r) => convertContract(r))

  // Prefer cash contracts over mana contracts in emails
  const manaContractIds = filterDefined(
    contracts.map((contract) =>
      contract.token === 'CASH' ? contract.siblingContractId : null
    )
  )
  const contractsWithoutDuplicates = contracts.filter(
    (contract) => !manaContractIds.includes(contract.id)
  )
  return contractsWithoutDuplicates ?? []
}
