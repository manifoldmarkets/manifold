import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import {
  getAllPrivateUsers,
  getGroup,
  getPrivateUser,
  getUser,
  getValues,
  isProd,
  log,
} from 'shared/utils'
import { createRNG, shuffle } from 'common/util/random'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { filterDefined } from 'common/util/array'
import { Follow } from 'common/follow'
import { countBy, uniq, uniqBy } from 'lodash'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { getTrendingContracts } from 'shared/utils'
import { secrets } from 'shared/secrets'

const GROUP_SLUGS_TO_IGNORE_IN_TRENDING = [
  'manifold-features',
  'manifold-6748e065087e',
  'destinygg',
]
const USERS_TO_EMAIL = 500

// This should(?) work until we have ~60k users (500 * 120)
export const weeklyMarketsEmails = functions
  .runWith({ secrets, memory: '4GB', timeoutSeconds: 540 })
  // every minute on Monday for 2 hours starting at 12pm PT (UTC -07:00)
  .pubsub.schedule('* 19-20 * * 1')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await sendTrendingMarketsEmailsToAllUsers()
  })

const firestore = admin.firestore()

export async function sendTrendingMarketsEmailsToAllUsers() {
  const numContractsToSend = 6
  const privateUsers = isProd()
    ? await getAllPrivateUsers()
    : filterDefined([
        await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2'), // dev Ian
      ])
  const privateUsersToSendEmailsTo = privateUsers
    // Get all users that haven't unsubscribed from weekly emails
    .filter(
      (user) =>
        user.notificationPreferences.trending_markets.includes('email') &&
        !user.notificationPreferences.opt_out_all.includes('email') &&
        !user.weeklyTrendingEmailSent &&
        user.email
    )
    .slice(0, USERS_TO_EMAIL) // Send the emails out in batches

  if (privateUsersToSendEmailsTo.length === 0) {
    log('No users to send trending markets emails to')
    return
  }

  await Promise.all(
    privateUsersToSendEmailsTo.map(async (privateUser) => {
      await firestore.collection('private-users').doc(privateUser.id).update({
        weeklyTrendingEmailSent: true,
      })
    })
  )

  log(
    'Sending weekly trending emails to',
    privateUsersToSendEmailsTo.length,
    'users'
  )
  const trendingContracts = (await getTrendingContracts())
    .filter(
      (contract) =>
        !(
          contract.question.toLowerCase().includes('stock') &&
          contract.question.toLowerCase().includes('permanent')
        ) &&
        (contract?.closeTime ?? 0) > Date.now() + DAY_MS &&
        !contract.groupSlugs?.some((slug) =>
          GROUP_SLUGS_TO_IGNORE_IN_TRENDING.includes(slug)
        )
    )
    .slice(0, 50)

  const uniqueTrendingContracts = removeSimilarQuestions(
    trendingContracts,
    trendingContracts,
    true
  ).slice(0, 20)

  let sent = 0
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (privateUser) => {
      if (!privateUser.email) return

      const unbetOnFollowedMarkets = await getUserUnBetOnFollowsMarkets(
        privateUser.id
      )
      const unBetOnGroupMarkets = await getUserUnBetOnGroupsMarkets(
        privateUser.id,
        unbetOnFollowedMarkets
      )
      const similarBettorsMarkets = await getSimilarBettorsMarkets(
        privateUser.id,
        unBetOnGroupMarkets
      )

      const marketsAvailableToSend = uniqBy(
        [
          ...chooseRandomSubset(unbetOnFollowedMarkets, 2),
          // // Most people will belong to groups but may not follow other users,
          // so choose more from the other subsets if the followed markets is sparse
          ...chooseRandomSubset(
            unBetOnGroupMarkets,
            unbetOnFollowedMarkets.length < 2 ? 3 : 2
          ),
          ...chooseRandomSubset(
            similarBettorsMarkets,
            unbetOnFollowedMarkets.length < 2 ? 3 : 2
          ),
        ],
        (contract) => contract.id
      )
      // // at least send them trending contracts if nothing else
      if (marketsAvailableToSend.length < numContractsToSend) {
        const trendingMarketsToSend =
          numContractsToSend - marketsAvailableToSend.length
        log(
          `not enough personalized markets, sending ${trendingMarketsToSend} trending`
        )
        marketsAvailableToSend.push(
          ...removeSimilarQuestions(
            uniqueTrendingContracts,
            marketsAvailableToSend,
            false
          )
            .filter(
              (contract) => !contract.uniqueBettorIds?.includes(privateUser.id)
            )
            .slice(0, trendingMarketsToSend)
        )
      }

      if (marketsAvailableToSend.length < numContractsToSend) {
        log(
          'not enough new, unbet-on contracts to send to user',
          privateUser.id
        )
        return
      }
      // choose random subset of contracts to send to user
      const contractsToSend = chooseRandomSubset(
        marketsAvailableToSend,
        numContractsToSend
      )

      const user = await getUser(privateUser.id)
      if (!user) return
      await sendInterestingMarketsEmail(user, privateUser, contractsToSend)
      sent++
      log(`emails sent: ${sent}/${USERS_TO_EMAIL}`)
    })
  )
}

const MINIMUM_POPULARITY_SCORE = 10

const getUserUnBetOnFollowsMarkets = async (userId: string) => {
  const follows = await getValues<Follow>(
    firestore.collection('users').doc(userId).collection('follows')
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
        (contract) => !contract.uniqueBettorIds?.includes(userId)
      )
    })
  )

  const sortedMarkets = uniqBy(
    unBetOnContractsFromFollows.flat(),
    (contract) => contract.id
  )
    .filter(
      (contract) =>
        contract.popularityScore !== undefined &&
        contract.popularityScore > MINIMUM_POPULARITY_SCORE
    )
    .sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0))

  const uniqueSortedMarkets = removeSimilarQuestions(
    sortedMarkets,
    sortedMarkets,
    true
  )

  const topSortedMarkets = uniqueSortedMarkets.slice(0, 10)
  // log(
  //   'top 10 sorted markets by followed users',
  //   topSortedMarkets.map((c) => c.question + ' ' + c.popularityScore)
  // )
  return topSortedMarkets
}

const getUserUnBetOnGroupsMarkets = async (
  userId: string,
  differentThanTheseContracts: Contract[]
) => {
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
  if (groups.length === 0) return []

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

  const sortedMarkets = uniqBy(
    unBetOnContractsFromGroups.flat(),
    (contract) => contract.id
  )
    .filter(
      (contract) =>
        contract.popularityScore !== undefined &&
        contract.popularityScore > MINIMUM_POPULARITY_SCORE
    )
    .sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0))

  const uniqueSortedMarkets = removeSimilarQuestions(
    sortedMarkets,
    sortedMarkets,
    true
  )
  const topSortedMarkets = removeSimilarQuestions(
    uniqueSortedMarkets,
    differentThanTheseContracts,
    false
  ).slice(0, 10)

  // log(
  //   'top 10 sorted group markets',
  //   topSortedMarkets.map((c) => c.question + ' ' + c.popularityScore)
  // )
  return topSortedMarkets
}

// Gets markets followed by similar bettors and bet on by similar bettors
const getSimilarBettorsMarkets = async (
  userId: string,
  differentThanTheseContracts: Contract[]
) => {
  // get contracts with unique bettor ids with this user
  const contractsUserHasBetOn = await getValues<Contract>(
    firestore
      .collection('contracts')
      .where('uniqueBettorIds', 'array-contains', userId)
      // Favor more recently created markets
      .orderBy('createdTime', 'desc')
      .limit(100)
  )
  if (contractsUserHasBetOn.length === 0) return []
  // count the number of times each unique bettor id appears on those contracts
  const bettorIdsToCounts = countBy(
    contractsUserHasBetOn.map((contract) => contract.uniqueBettorIds).flat(),
    (bettorId) => bettorId
  )

  // sort by number of times they appear with at least 2 appearances
  const sortedBettorIds = Object.entries(bettorIdsToCounts)
    .sort((a, b) => b[1] - a[1])
    .filter((bettorId) => bettorId[1] > 2)
    .map((entry) => entry[0])
    .filter((bettorId) => bettorId !== userId)

  // get the top 10 most similar bettors (excluding this user)
  const similarBettorIds = sortedBettorIds.slice(0, 10)
  if (similarBettorIds.length === 0) return []

  // get contracts with unique bettor ids with this user
  const contractsSimilarBettorsHaveBetOn = uniqBy(
    (
      await getValues<Contract>(
        firestore
          .collection('contracts')
          .where(
            'uniqueBettorIds',
            'array-contains-any',
            similarBettorIds.slice(0, 10)
          )
          .orderBy('popularityScore', 'desc')
          .limit(200)
      )
    ).filter(
      (contract) =>
        !contract.uniqueBettorIds?.includes(userId) &&
        (contract.popularityScore ?? 0) > MINIMUM_POPULARITY_SCORE
    ),
    (contract) => contract.id
  )

  // sort the contracts by how many times similar bettor ids are in their unique bettor ids array
  const sortedContractsInSimilarBettorsBets = contractsSimilarBettorsHaveBetOn
    .map((contract) => {
      const appearances = contract.uniqueBettorIds?.filter((bettorId) =>
        similarBettorIds.includes(bettorId)
      ).length
      return [contract, appearances] as [Contract, number]
    })
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0])

  const uniqueSortedContractsInSimilarBettorsBets = removeSimilarQuestions(
    sortedContractsInSimilarBettorsBets,
    sortedContractsInSimilarBettorsBets,
    true
  )

  const topMostSimilarContracts = removeSimilarQuestions(
    uniqueSortedContractsInSimilarBettorsBets,
    differentThanTheseContracts,
    false
  ).slice(0, 10)

  // log(
  //   'top 10 sorted contracts other similar bettors have bet on',
  //   topMostSimilarContracts.map((c) => c.question)
  // )

  return topMostSimilarContracts
}

// search contract array by question and remove contracts with 3 matching words in the question
const removeSimilarQuestions = (
  contractsToFilter: Contract[],
  byContracts: Contract[],
  allowExactSameContracts: boolean
) => {
  // log(
  //   'contracts to filter by',
  //   byContracts.map((c) => c.question + ' ' + c.popularityScore)
  // )
  let contractsToRemove: Contract[] = []
  byContracts.length > 0 &&
    byContracts.forEach((contract) => {
      const contractQuestion = stripNonAlphaChars(
        contract.question.toLowerCase()
      )
      const contractQuestionWords = uniq(contractQuestion.split(' ')).filter(
        (w) => !IGNORE_WORDS.includes(w)
      )
      contractsToRemove = contractsToRemove.concat(
        contractsToFilter.filter(
          // Remove contracts with more than 2 matching (uncommon) words and a lower popularity score
          (c2) => {
            const significantOverlap =
              // TODO: we should probably use a library for comparing strings/sentiments
              uniq(
                stripNonAlphaChars(c2.question.toLowerCase()).split(' ')
              ).filter((word) => contractQuestionWords.includes(word)).length >
              2
            const lessPopular =
              (c2.popularityScore ?? 0) < (contract.popularityScore ?? 0)
            return (
              (significantOverlap && lessPopular) ||
              (allowExactSameContracts ? false : c2.id === contract.id)
            )
          }
        )
      )
    })
  // log(
  //   'contracts to filter out',
  //   contractsToRemove.map((c) => c.question)
  // )

  const returnContracts = contractsToFilter.filter(
    (cf) => !contractsToRemove.some((c) => c.id === cf.id)
  )

  return returnContracts
}

const fiveMinutes = 5 * 60 * 1000
const seed = Math.round(Date.now() / fiveMinutes).toString()
const rng = createRNG(seed)

function chooseRandomSubset(contracts: Contract[], count: number) {
  shuffle(contracts, rng)
  return contracts.slice(0, count)
}

function stripNonAlphaChars(str: string) {
  return str.replace(/[^\w\s']|_/g, '').replace(/\s+/g, ' ')
}

const IGNORE_WORDS = [
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'will',
  'be',
  'is',
  'are',
  'for',
  'by',
  'at',
  'from',
  'what',
  'when',
  'which',
  'that',
  'it',
  'as',
  'if',
  'then',
  'than',
  'but',
  'have',
  'has',
  'had',
]
