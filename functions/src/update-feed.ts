import * as _ from 'lodash'
import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getValue, getValues } from './utils'
import { Contract } from '../../common/contract'
import { logInterpolation } from '../../common/util/math'
import { DAY_MS } from '../../common/util/time'
import {
  getProbability,
  getOutcomeProbability,
  getTopAnswer,
} from '../../common/calculate'
import { User } from '../../common/user'
import {
  getContractScore,
  MAX_FEED_CONTRACTS,
} from '../../common/recommended-contracts'
import { callCloudFunction } from './call-cloud-function'
import {
  getFeedContracts,
  getRecentBetsAndComments,
  getTaggedContracts,
} from './get-feed-data'
import { CATEGORY_LIST } from '../../common/categories'

const firestore = admin.firestore()

const BATCH_SIZE = 30
const MAX_BATCHES = 50

const getUserBatches = async () => {
  const users = _.shuffle(await getValues<User>(firestore.collection('users')))
  let userBatches: User[][] = []
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    userBatches.push(users.slice(i, i + BATCH_SIZE))
  }

  console.log('updating feed batches', MAX_BATCHES, 'of', userBatches.length)

  return userBatches.slice(0, MAX_BATCHES)
}

export const updateFeed = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const userBatches = await getUserBatches()

    await Promise.all(
      userBatches.map((users) =>
        callCloudFunction('updateFeedBatch', { users })
      )
    )

    console.log('updating category feed')

    await Promise.all(
      CATEGORY_LIST.map((category) =>
        callCloudFunction('updateCategoryFeed', {
          category,
        })
      )
    )
  })

export const updateFeedBatch = functions.https.onCall(
  async (data: { users: User[] }) => {
    const { users } = data
    const contracts = await getFeedContracts()

    await Promise.all(
      users.map(async (user) => {
        const feed = await computeFeed(user, contracts)
        await getUserCacheCollection(user).doc('feed').set({ feed })
      })
    )
  }
)
export const updateCategoryFeed = functions.https.onCall(
  async (data: { category: string }) => {
    const { category } = data
    const userBatches = await getUserBatches()

    await Promise.all(
      userBatches.map(async (users) => {
        await callCloudFunction('updateCategoryFeedBatch', {
          users,
          category,
        })
      })
    )
  }
)

export const updateCategoryFeedBatch = functions.https.onCall(
  async (data: { users: User[]; category: string }) => {
    const { users, category } = data
    const contracts = await getTaggedContracts(category)

    await Promise.all(
      users.map(async (user) => {
        const feed = await computeFeed(user, contracts)
        await getUserCacheCollection(user).doc(`feed-${category}`).set({ feed })
      })
    )
  }
)

const getUserCacheCollection = (user: User) =>
  firestore.collection(`private-users/${user.id}/cache`)

export const computeFeed = async (user: User, contracts: Contract[]) => {
  const userCacheCollection = getUserCacheCollection(user)

  const [wordScores, lastViewedTime] = await Promise.all([
    getValue<{ [word: string]: number }>(userCacheCollection.doc('wordScores')),
    getValue<{ [contractId: string]: number }>(
      userCacheCollection.doc('lastViewTime')
    ),
  ]).then((dicts) => dicts.map((dict) => dict ?? {}))

  const scoredContracts = contracts.map((contract) => {
    const score = scoreContract(
      contract,
      wordScores,
      lastViewedTime[contract.id]
    )
    return [contract, score] as [Contract, number]
  })

  const sortedContracts = _.sortBy(
    scoredContracts,
    ([_, score]) => score
  ).reverse()

  // console.log(sortedContracts.map(([c, score]) => c.question + ': ' + score))

  const feedContracts = sortedContracts
    .slice(0, MAX_FEED_CONTRACTS)
    .map(([c]) => c)

  const feed = await Promise.all(
    feedContracts.map((contract) => getRecentBetsAndComments(contract))
  )
  return feed
}

function scoreContract(
  contract: Contract,
  wordScores: { [word: string]: number },
  viewTime: number | undefined
) {
  const recommendationScore = getContractScore(contract, wordScores)
  const activityScore = getActivityScore(contract, viewTime)
  // const lastViewedScore = getLastViewedScore(viewTime)
  return recommendationScore * activityScore
}

function getActivityScore(contract: Contract, viewTime: number | undefined) {
  const { createdTime, lastBetTime, lastCommentTime, outcomeType } = contract
  const hasNewComments =
    lastCommentTime && (!viewTime || lastCommentTime > viewTime)
  const newCommentScore = hasNewComments ? 1 : 0.5

  const timeSinceLastComment = Date.now() - (lastCommentTime ?? createdTime)
  const commentDaysAgo = timeSinceLastComment / DAY_MS
  const commentTimeScore =
    0.25 + 0.75 * (1 - logInterpolation(0, 3, commentDaysAgo))

  const timeSinceLastBet = Date.now() - (lastBetTime ?? createdTime)
  const betDaysAgo = timeSinceLastBet / DAY_MS
  const betTimeScore = 0.5 + 0.5 * (1 - logInterpolation(0, 3, betDaysAgo))

  let prob = 0.5
  if (outcomeType === 'BINARY') {
    prob = getProbability(contract)
  } else if (outcomeType === 'FREE_RESPONSE') {
    const topAnswer = getTopAnswer(contract)
    if (topAnswer)
      prob = Math.max(0.5, getOutcomeProbability(contract, topAnswer.id))
  }
  const frac = 1 - Math.abs(prob - 0.5) ** 2 / 0.25
  const probScore = 0.5 + frac * 0.5

  const { volume24Hours, volume7Days } = contract
  const combinedVolume = Math.log(volume24Hours + 1) + Math.log(volume7Days + 1)
  const volumeScore = 0.5 + 0.5 * logInterpolation(4, 20, combinedVolume)

  const score =
    newCommentScore * commentTimeScore * betTimeScore * probScore * volumeScore

  // Map score to [0.5, 1] since no recent activty is not a deal breaker.
  const mappedScore = 0.5 + 0.5 * score
  const newMappedScore = 0.7 + 0.3 * score

  const isNew = Date.now() < contract.createdTime + DAY_MS
  return isNew ? newMappedScore : mappedScore
}

function getLastViewedScore(viewTime: number | undefined) {
  if (viewTime === undefined) {
    return 1
  }

  const daysAgo = (Date.now() - viewTime) / DAY_MS

  if (daysAgo < 0.5) {
    const frac = logInterpolation(0, 0.5, daysAgo)
    return 0.5 + 0.25 * frac
  }

  const frac = logInterpolation(0.5, 14, daysAgo)
  return 0.75 + 0.25 * frac
}
