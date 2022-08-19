import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from '../../common/contract'
import { getAllPrivateUsers, getUser, getValues, log } from './utils'
import { sendInterestingMarketsEmail } from './emails'
import { createRNG, shuffle } from '../../common/util/random'
import { DAY_MS } from '../../common/util/time'

export const weeklyMarketsEmails = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  // every Monday at 12pm PT (UTC -07:00)
  .pubsub.schedule('0 19 * * 1')
  .onRun(async () => {
    await sendTrendingMarketsEmailsToAllUsers()
  })

const firestore = admin.firestore()

export async function getTrendingContracts() {
  return await getValues<Contract>(
    firestore
      .collection('contracts')
      .where('isResolved', '==', false)
      .where('visibility', '==', 'public')
      // can't use multiple inequality (/orderBy) operators on different fields,
      // so have to filter for closed contracts separately
      .orderBy('popularityScore', 'desc')
      // might as well go big and do a quick filter for closed ones later
      .limit(500)
  )
}

async function sendTrendingMarketsEmailsToAllUsers() {
  const numContractsToSend = 6
  const privateUsers = await getAllPrivateUsers()
  // get all users that haven't unsubscribed from weekly emails
  const privateUsersToSendEmailsTo = privateUsers.filter((user) => {
    return !user.unsubscribedFromWeeklyTrendingEmails
  })
  const trendingContracts = (await getTrendingContracts())
    .filter(
      (contract) =>
        !(
          contract.question.toLowerCase().includes('trump') &&
          contract.question.toLowerCase().includes('president')
        ) && (contract?.closeTime ?? 0) > Date.now() + DAY_MS
    )
    .slice(0, 20)
  for (const privateUser of privateUsersToSendEmailsTo) {
    if (!privateUser.email) {
      log(`No email for ${privateUser.username}`)
      continue
    }
    const contractsAvailableToSend = trendingContracts.filter((contract) => {
      return !contract.uniqueBettorIds?.includes(privateUser.id)
    })
    if (contractsAvailableToSend.length < numContractsToSend) {
      log('not enough new, unbet-on contracts to send to user', privateUser.id)
      continue
    }
    // choose random subset of contracts to send to user
    const contractsToSend = chooseRandomSubset(
      contractsAvailableToSend,
      numContractsToSend
    )

    const user = await getUser(privateUser.id)
    if (!user) continue

    await sendInterestingMarketsEmail(user, privateUser, contractsToSend)
  }
}

function chooseRandomSubset(contracts: Contract[], count: number) {
  const fiveMinutes = 5 * 60 * 1000
  const seed = Math.round(Date.now() / fiveMinutes).toString()
  shuffle(contracts, createRNG(seed))
  return contracts.slice(0, count)
}
