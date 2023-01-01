import { getMarketRecommendations, user_data } from 'common/recommendation'
import { User } from 'common/user'
import { asyncMap } from 'common/util/promise'
import { DAY_MS } from 'common/util/time'
import * as admin from 'firebase-admin'
import { CollectionReference, Query } from 'firebase-admin/firestore'
import { sortBy, uniq } from 'lodash'
import { readJson, writeJson } from '../helpers/file'
import { getContract, loadPaginated } from '../utils'

import { initAdmin } from './script-init'
initAdmin()
const firestore = admin.firestore()

const loadUserData = async () => {
  const users = await loadPaginated(
    firestore.collection('users') as CollectionReference<User>
  )

  console.log('Loaded', users.length, 'users')

  const threeDaysAgo = Date.now() - DAY_MS * 3

  return await asyncMap(users, async (user) => {
    console.log(user.id)
    const userId = user.id

    const betOnIds = (
      await loadPaginated(
        firestore
          .collection('users')
          .doc(userId)
          .collection('contract-metrics')
          .select('contractId') as Query<{ contractId: string }>
      )
    ).map(({ contractId }) => contractId)

    const recentBetOnIds = (
      await loadPaginated(
        firestore
          .collection('users')
          .doc(userId)
          .collection('contract-metrics')
          .where('lastBetTime', '>', threeDaysAgo)
          .select('contractId', 'lastBetTime') as Query<{ contractId: string }>
      )
    ).map(({ contractId }) => contractId)

    const swipedIds = uniq(
      (
        await loadPaginated(
          admin
            .firestore()
            .collection('users')
            .doc(user.id)
            .collection('seenMarkets')
            .select('id') as Query<{ id: string }>
        )
      ).map(({ id }) => id)
    )
    const recentSwipedIds = uniq(
      (
        await loadPaginated(
          admin
            .firestore()
            .collection('users')
            .doc(user.id)
            .collection('seenMarkets')
            .where('time', '>', threeDaysAgo)
            .select('id') as Query<{ id: string }>
        )
      ).map(({ id }) => id)
    )

    const viewedCardIds = uniq(
      (
        await loadPaginated(
          firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .where('name', '==', 'view market card')
            .select('contractId') as Query<{ contractId: string }>
        )
      ).map(({ contractId }) => contractId)
    )
    const recentViewedCardIds = uniq(
      (
        await loadPaginated(
          firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .where('name', '==', 'view market card')
            .where('timestamp', '>', threeDaysAgo)
            .select('contractId', 'timestamp') as Query<{ contractId: string }>
        )
      ).map(({ contractId }) => contractId)
    )

    const viewedPageIds = uniq(
      (
        await loadPaginated(
          firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .where('name', '==', 'view market')
            .select('contractId') as Query<{ contractId: string }>
        )
      ).map(({ contractId }) => contractId)
    )
    const recentViewedPageIds = uniq(
      (
        await loadPaginated(
          firestore
            .collection('users')
            .doc(userId)
            .collection('events')
            .where('name', '==', 'view market')
            .where('timestamp', '>', threeDaysAgo)
            .select('contractId', 'timestamp') as Query<{ contractId: string }>
        )
      ).map(({ contractId }) => contractId)
    )

    const likedIds = uniq(
      (
        await loadPaginated(
          admin
            .firestore()
            .collection('users')
            .doc(userId)
            .collection('reactions')
            .where('contentType', '==', 'contract')
            .select('contentId') as Query<{ contentId: string }>
        )
      ).map(({ contentId }) => contentId)
    )

    const recentLikedIds = uniq(
      (
        await loadPaginated(
          admin
            .firestore()
            .collection('users')
            .doc(userId)
            .collection('reactions')
            .where('contentType', '==', 'contract')
            .where('createdTime', '>', threeDaysAgo)
            .select('contentId', 'createdTime') as Query<{ contentId: string }>
        )
      ).map(({ contentId }) => contentId)
    )

    return {
      userId,
      betOnIds,
      recentBetOnIds,
      swipedIds,
      recentSwipedIds,
      viewedCardIds,
      recentViewedCardIds,
      viewedPageIds,
      recentViewedPageIds,
      likedIds,
      recentLikedIds,
    }
  })
}

const recommend = async () => {
  console.log('Recommend script')

  let userData = await readJson<user_data[]>('user-data2.json')

  if (userData) {
    console.log('Loaded view data from file.')
  } else {
    console.log('Loading view data from Firestore...')
    userData = await loadUserData()
    await writeJson('user-data2.json', userData)
  }

  console.log('Computing recommendations...')
  const getUserContractScores = await getMarketRecommendations(userData)

  console.log('Destiny user scores')
  await printUserScores('PKj937RvUZYUbnG7IU8sVPN7XYr1', getUserContractScores)

  console.log('Bembo scores')
  await printUserScores('G3S3nhcGWhPU3WEtlUYbAH4tv7f1', getUserContractScores)

  console.log('Stephen scores')
  await printUserScores('tlmGNz9kjXc2EteizMORes4qvWl2', getUserContractScores)

  console.log('James scores')
  await printUserScores('5LZ4LgYuySdL1huCWe7bti02ghx2', getUserContractScores)
}

async function printUserScores(
  userId: string,
  getUserContractScores: (userId: string) => { [k: string]: number }
) {
  const userScores = getUserContractScores(userId)
  const sortedScores = sortBy(Object.entries(userScores), ([, score]) => -score)
  console.log(
    'top scores',
    sortedScores.slice(0, 20),
    (
      await Promise.all(
        sortedScores.slice(0, 20).map(([contractId]) => getContract(contractId))
      )
    ).map((c) => c?.question)
  )

  console.log(
    'bottom scores',
    sortedScores.slice(sortedScores.length - 20),
    (
      await Promise.all(
        sortedScores
          .slice(sortedScores.length - 20)
          .map(([contractId]) => getContract(contractId))
      )
    ).map((c) => c?.question)
  )
}

if (require.main === module) {
  recommend().then(() => process.exit())
}
