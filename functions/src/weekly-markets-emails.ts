import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from '../../common/contract'
import { getPrivateUser, getUser, getValues, isProd, log } from './utils'
import { filterDefined } from '../../common/util/array'
import { sendInterestingMarketsEmail } from './emails'
import { createRNG, shuffle } from '../../common/util/random'
import { DAY_MS } from '../../common/util/time'

export const weeklyMarketsEmails = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    await sendTrendingMarketsEmailsToAllUsers()
  })

const firestore = admin.firestore()

export async function getTrendingContracts() {
  return await getValues<Contract>(
    firestore
      .collection('contracts')
      .where('isResolved', '==', false)
      .where('closeTime', '>', Date.now() + DAY_MS)
      .where('visibility', '==', 'public')
      .orderBy('closeTime', 'asc')
      .orderBy('popularityScore', 'desc')
      .limit(15)
  )
}

async function sendTrendingMarketsEmailsToAllUsers() {
  const numEmailsToSend = 6
  // const privateUsers = await getAllPrivateUsers()
  // uses dev ian's private user for testing
  const privateUser = await getPrivateUser(
    isProd() ? 'AJwLWoo3xue32XIiAVrL5SyR1WB2' : '6hHpzvRG0pMq8PNJs7RZj2qlZGn2'
  )
  const privateUsers = filterDefined([privateUser])
  // get all users that haven't unsubscribed from weekly emails
  const privateUsersToSendEmailsTo = privateUsers.filter((user) => {
    return !user.unsubscribedFromWeeklyTrendingEmails
  })
  const trendingContracts = (await getTrendingContracts()).filter(
    (contract) =>
      !(
        contract.question.toLowerCase().includes('trump') &&
        contract.question.toLowerCase().includes('president')
      )
  )
  for (const privateUser of privateUsersToSendEmailsTo) {
    if (!privateUser.email) {
      log(`No email for ${privateUser.username}`)
      continue
    }
    const contractsAvailableToSend = trendingContracts.filter((contract) => {
      return !contract.uniqueBettorIds?.includes(privateUser.id)
    })
    if (contractsAvailableToSend.length < numEmailsToSend) {
      log('not enough new, unbet-on contracts to send to user', privateUser.id)
      continue
    }
    // choose random subset of contracts to send to user
    const contractsToSend = chooseRandomSubset(
      contractsAvailableToSend,
      numEmailsToSend
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
