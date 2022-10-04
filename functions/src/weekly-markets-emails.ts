import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from '../../common/contract'
import { getGroup, getPrivateUser, getUser, getValues, log } from './utils'
import { createRNG, shuffle } from '../../common/util/random'
import { DAY_MS, HOUR_MS } from '../../common/util/time'
import { filterDefined } from '../../common/util/array'
import { Follow } from '../../common/follow'
import { countBy, uniqBy } from 'lodash'
import { sendInterestingMarketsEmail } from './emails'

export const weeklyMarketsEmails = functions
  .runWith({ secrets: ['MAILGUN_KEY'], memory: '4GB' })
  // every minute on Monday for 2 hours starting at 12pm PT (UTC -07:00)
  .pubsub.schedule('* 19-20 * * 1')
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

export async function sendTrendingMarketsEmailsToAllUsers() {
  const numContractsToSend = 6
  // const privateUsers =
  //   isProd()
  //   ? await getAllPrivateUsers()
  //   filterDefined([
  //     await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2'), // dev Ian
  //     ])
  const privateUsersToSendEmailsTo =
    // get all users that haven't unsubscribed from weekly emails
    // isProd()
    // ? privateUsers
    //     .filter((user) => {
    //       user.notificationPreferences.trending_markets.includes('email') &&
    //         !user.weeklyTrendingEmailSent
    //     })
    //     .slice(125) // Send the emails out in batches
    // :
    // privateUsers
    filterDefined([
      await getPrivateUser('AJwLWoo3xue32XIiAVrL5SyR1WB2'), // prod Ian
      await getPrivateUser('FptiiMZZ6dQivihLI8MYFQ6ypSw1'),
    ])

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
  // log(
  //   `Found ${trendingContracts.length} trending contracts:\n`,
  //   trendingContracts.map((c) => c.question).join('\n ')
  // )

  await Promise.all(
    privateUsersToSendEmailsTo.map(async (privateUser) => {
      if (!privateUser.email) {
        log(`No email for ${privateUser.username}`)
        return
      }
      const marketsAvailableToSend = uniqBy(
        [
          ...(await getUserUnBetOnFollowsMarkets(
            privateUser.id,
            privateUser.id
          )),
          ...(await getUserUnBetOnGroupsMarkets(privateUser.id)),
          ...(await getSimilarBettorsMarkets(privateUser.id)),
        ],
        (contract) => contract.id
      )
      // at least send them trending contracts if nothing else
      if (marketsAvailableToSend.length < numContractsToSend)
        marketsAvailableToSend.push(
          ...trendingContracts
            .filter(
              (contract) =>
                !contract.uniqueBettorIds?.includes(privateUser.id) &&
                !marketsAvailableToSend.map((c) => c.id).includes(contract.id)
            )
            .slice(0, numContractsToSend - marketsAvailableToSend.length)
        )

      if (marketsAvailableToSend.length < numContractsToSend) {
        log(
          'not enough new, unbet-on contracts to send to user',
          privateUser.id
        )
        await firestore.collection('private-users').doc(privateUser.id).update({
          weeklyTrendingEmailSent: true,
        })
        return
      }
      // choose random subset of contracts to send to user
      const contractsToSend = chooseRandomSubset(
        marketsAvailableToSend,
        numContractsToSend
      )

      const user = await getUser(privateUser.id)
      if (!user) return

      console.log(
        'sending contracts:',
        contractsToSend.map((c) => [c.question, c.popularityScore])
      )
      // if they don't have enough markets, find user bets and get the other bettor ids who most overlap on those markets, then do the same thing as above for them
      // await sendInterestingMarketsEmail(user, privateUser, contractsToSend)
      await sendInterestingMarketsEmail(
        user,
        privateUsersToSendEmailsTo[0],
        contractsToSend
      )
      await firestore.collection('private-users').doc(user.id).update({
        weeklyTrendingEmailSent: true,
      })
    })
  )
}

// TODO: figure out a good minimum popularity score to filter by
const MINIMUM_POPULARITY_SCORE = 2

const getUserUnBetOnFollowsMarkets = async (
  userId: string,
  unBetOnByUserId: string
) => {
  const follows = await getValues<Follow>(
    firestore.collection('users').doc(userId).collection('follows')
  )
  console.log(
    'follows',
    follows.map((f) => f.userId)
  )

  const unBetOnContractsFromFollows = await Promise.all(
    follows.map(async (follow) => {
      const unresolvedContracts = await getValues<Contract>(
        firestore
          .collection('contracts')
          .where('isResolved', '==', false)
          .where('visibility', '==', 'public')
          .where('creatorId', '==', follow.userId)
          // can't use multiple inequality (/orderBy) operators on different fields,
          // so have to filter for closed contracts separately
          .orderBy('popularityScore', 'desc')
          .limit(50)
      )
      // filter out contracts that have close times less than 6 hours from now
      const openContracts = unresolvedContracts.filter(
        (contract) => (contract?.closeTime ?? 0) > Date.now() + 6 * HOUR_MS
      )

      return openContracts.filter(
        (contract) => !contract.uniqueBettorIds?.includes(unBetOnByUserId)
      )
    })
  )

  const sortedMarkets = unBetOnContractsFromFollows
    .flat()
    .filter(
      (contract) =>
        contract.popularityScore !== undefined &&
        contract.popularityScore > MINIMUM_POPULARITY_SCORE
    )
    .sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0))
  console.log(
    'sorted top 10 follow Markets',
    sortedMarkets
      .slice(0, 10)
      .map((c) => [c.question, c.popularityScore, c.creatorId])
  )
  return sortedMarkets
}

const getUserUnBetOnGroupsMarkets = async (userId: string) => {
  const snap = await firestore
    .collectionGroup('groupMembers')
    .where('userId', '==', userId)
    .get()

  const groupIds = filterDefined(
    snap.docs.map((doc) => doc.ref.parent.parent?.id)
  )
  const groups = filterDefined(
    await Promise.all(groupIds.map(async (groupId) => await getGroup(groupId)))
  )
  console.log(
    'groups',
    groups.map((g) => g.name)
  )
  const unBetOnContractsFromGroups = await Promise.all(
    groups.map(async (group) => {
      const unresolvedContracts = await getValues<Contract>(
        firestore
          .collection('contracts')
          .where('isResolved', '==', false)
          .where('visibility', '==', 'public')
          .where('groupSlugs', 'array-contains', group.slug)
          // can't use multiple inequality (/orderBy) operators on different fields,
          // so have to filter for closed contracts separately
          .orderBy('popularityScore', 'desc')
          .limit(50)
      )
      // filter out contracts that have close times less than 6 hours from now
      const openContracts = unresolvedContracts.filter(
        (contract) => (contract?.closeTime ?? 0) > Date.now() + 6 * HOUR_MS
      )

      return openContracts.filter(
        (contract) => !contract.uniqueBettorIds?.includes(userId)
      )
    })
  )
  const sortedMarkets = unBetOnContractsFromGroups
    .flat()
    .filter(
      (contract) =>
        contract.popularityScore !== undefined &&
        contract.popularityScore > MINIMUM_POPULARITY_SCORE
    )
    .sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0))
  console.log(
    'top 10 sorted group Markets',
    sortedMarkets
      .slice(0, 10)
      .map((c) => [c.question, c.popularityScore, c.groupSlugs])
  )
  return sortedMarkets
}

// Gets markets followed by similar bettors and bet on by similar bettors
const getSimilarBettorsMarkets = async (userId: string) => {
  // get contracts with unique bettor ids with this user
  const contractsUserHasBetOn = await getValues<Contract>(
    firestore
      .collection('contracts')
      .where('uniqueBettorIds', 'array-contains', userId)
  )
  // count the number of times each unique bettor id appears on those contracts
  const bettorIdsToCounts = countBy(
    contractsUserHasBetOn.map((contract) => contract.uniqueBettorIds).flat(),
    (bettorId) => bettorId
  )
  console.log('bettorIdCounts', bettorIdsToCounts)

  // sort by number of times they appear with at least 2 appearances
  const sortedBettorIds = Object.entries(bettorIdsToCounts)
    .sort((a, b) => b[1] - a[1])
    .filter((bettorId) => bettorId[1] > 2)
    .map((entry) => entry[0])
    .filter((bettorId) => bettorId !== userId)

  // get the top 10 most similar bettors (excluding this user)
  const similarBettorIds = sortedBettorIds.slice(0, 10)
  console.log('top sortedBettorIds', similarBettorIds)

  // get contracts with unique bettor ids with this user
  const contractsSimilarBettorsHaveBetOn = (
    await getValues<Contract>(
      firestore
        .collection('contracts')
        .where(
          'uniqueBettorIds',
          'array-contains-any',
          similarBettorIds.slice(0, 10)
        )
        .orderBy('popularityScore', 'desc')
        .limit(100)
    )
  ).filter((contract) => !contract.uniqueBettorIds?.includes(userId))

  // sort the contracts by how many times similar bettor ids are in their unique bettor ids array
  const sortedContractsToAppearancesInSimilarBettorsBets =
    contractsSimilarBettorsHaveBetOn
      .map((contract) => {
        const appearances = contract.uniqueBettorIds?.filter((bettorId) =>
          similarBettorIds.includes(bettorId)
        ).length
        return [contract, appearances] as [Contract, number]
      })
      .sort((a, b) => b[1] - a[1])
  console.log(
    'sortedContractsToAppearancesInSimilarBettorsBets',
    sortedContractsToAppearancesInSimilarBettorsBets.map((c) => [
      c[0].question,
      c[1],
    ])
  )

  const topMostSimilarContracts =
    sortedContractsToAppearancesInSimilarBettorsBets.map((entry) => entry[0])

  console.log(
    'top 10 sortedContractsToAppearancesInSimilarBettorsBets',
    topMostSimilarContracts
      .map((c) => [
        c.question,
        c.uniqueBettorIds?.filter((bid) => similarBettorIds.includes(bid)),
      ])
      .slice(0, 10)
  )

  return topMostSimilarContracts
}

const fiveMinutes = 5 * 60 * 1000
const seed = Math.round(Date.now() / fiveMinutes).toString()
const rng = createRNG(seed)

function chooseRandomSubset(contracts: Contract[], count: number) {
  shuffle(contracts, rng)
  return contracts.slice(0, count)
}
