import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from '../../common/contract'
import { getAllPrivateUsers, getPrivateUser, getValues, log } from './utils'
import { sendTemplateEmail } from './send-email'
import { createRNG, shuffle } from '../../common/util/random'
import { filterDefined } from '../../common/util/array'

export const weeklyMarketsEmails = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    await sendTrendingMarketsEmailsToAllUsers()
  })

const firestore = admin.firestore()

async function getTrendingContracts() {
  return await getValues<Contract>(
    firestore
      .collection('contracts')
      .where('isResolved', '==', false)
      .where('visibility', '==', 'public')
      .orderBy('popularityScore', 'desc')
      .limit(50)
  )
}

async function sendTrendingMarketsEmailsToAllUsers() {
  const numMarketsToSend = 3
  // const privateUsers = await getAllPrivateUsers()
  // uses dev ian's private user for testing
  const privateUser = await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')
  const privateUsers = filterDefined([privateUser])
  // get all users that haven't unsubscribed from weekly emails
  const privateUsersToSendEmailsTo = privateUsers.filter((user) => {
    return !user.unsubscribedFromWeeklyTrendingEmails
  })
  const trendingContracts = await getTrendingContracts()
  for (const privateUser of privateUsersToSendEmailsTo) {
    if (!privateUser.email) {
      log(`No email for ${privateUser.username}`)
      continue
    }
    const contractsAvailableToSend = trendingContracts.filter((contract) => {
      return !contract.uniqueBettorIds?.includes(privateUser.id)
    })
    if (contractsAvailableToSend.length < numMarketsToSend) {
      log('not enough new, unbet-on contracts to send to user', privateUser.id)
      continue
    }
    // choose random subset of contracts to send to user
    const contractsToSend = chooseRandomSubset(
      contractsAvailableToSend,
      numMarketsToSend
    )

    await sendTemplateEmail(
      privateUser.email,
      contractsToSend[0].question,
      '3-trending-markets',
      {
        question1title: contractsToSend[0].question,
        question1Description: getTextDescription(contractsToSend[0]),
        question1link: contractUrl(contractsToSend[0]),
        question2title: contractsToSend[1].question,
        question2Description: getTextDescription(contractsToSend[1]),
        question2link: contractUrl(contractsToSend[1]),
        question3title: contractsToSend[2].question,
        question3Description: getTextDescription(contractsToSend[2]),
        question3link: contractUrl(contractsToSend[2]),
      }
    )
  }
}

function getTextDescription(contract: Contract) {
  // if the contract.description is of type string, return it, otherwise return the text of the json content
  return typeof contract.description === 'string'
    ? contract.description
    : contract.description.text ?? ''
}

function contractUrl(contract: Contract) {
  return `https://manifold.markets/${contract.creatorUsername}/${contract.slug}`
}

function chooseRandomSubset(contracts: Contract[], count: number) {
  const fiveMinutes = 5 * 60 * 1000
  const seed = Math.round(Date.now() / fiveMinutes).toString()
  shuffle(contracts, createRNG(seed))
  return contracts.slice(0, count)
}
