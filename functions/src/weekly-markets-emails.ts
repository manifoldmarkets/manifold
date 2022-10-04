import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from '../../common/contract'
import {
  getAllPrivateUsers,
  getPrivateUser,
  getUser,
  getValues,
  isProd,
  log,
} from './utils'
import { sendInterestingMarketsEmail } from './emails'
import { createRNG, shuffle } from '../../common/util/random'
import { DAY_MS } from '../../common/util/time'
import { filterDefined } from '../../common/util/array'

export const weeklyMarketsEmails = functions
  .runWith({ secrets: ['MAILGUN_KEY'], memory: '4GB' })
  // TODO change back to Monday after the rest of the emails go out
  // every minute on Tuesday for 2 hours starting at 12pm PT (UTC -07:00)
  .pubsub.schedule('* 19-20 * * 2')
  .timeZone('Etc/UTC')
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
  const privateUsers = isProd()
    ? await getAllPrivateUsers()
    : filterDefined([await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')])
  // get all users that haven't unsubscribed from weekly emails
  const privateUsersToSendEmailsTo = privateUsers
    .filter((user) => {
      return (
        user.notificationPreferences.trending_markets.includes('email') &&
        !user.weeklyTrendingEmailSent
      )
    })
    .slice(125) // Send the emails out in batches
  log(
    'Sending weekly trending emails to',
    privateUsersToSendEmailsTo.length,
    'users'
  )
  const trendingContracts = (await getTrendingContracts())
    .filter(
      (contract) =>
        !(
          contract.question.toLowerCase().includes('trump') &&
          contract.question.toLowerCase().includes('president')
        ) &&
        (contract?.closeTime ?? 0) > Date.now() + DAY_MS &&
        !contract.groupSlugs?.includes('manifold-features') &&
        !contract.groupSlugs?.includes('manifold-6748e065087e')
    )
    .slice(0, 20)
  log(
    `Found ${trendingContracts.length} trending contracts:\n`,
    trendingContracts.map((c) => c.question).join('\n ')
  )

  // TODO: convert to Promise.all
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
      await firestore.collection('private-users').doc(privateUser.id).update({
        weeklyTrendingEmailSent: true,
      })
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
    await firestore.collection('private-users').doc(user.id).update({
      weeklyTrendingEmailSent: true,
    })
  }
}

const fiveMinutes = 5 * 60 * 1000
const seed = Math.round(Date.now() / fiveMinutes).toString()
const rng = createRNG(seed)

function chooseRandomSubset(contracts: Contract[], count: number) {
  shuffle(contracts, rng)
  return contracts.slice(0, count)
}
