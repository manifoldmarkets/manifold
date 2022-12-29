import { Contract } from 'common/contract'
import { getMarketRecommendations, user_data } from 'common/recommendation'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import { asyncMap } from 'common/util/promise'
import * as admin from 'firebase-admin'
import { CollectionReference, Query } from 'firebase-admin/firestore'
import { groupBy, mapValues, sortBy, uniq } from 'lodash'
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

  const contractUniqueBettorIds = await loadPaginated(
    admin
      .firestore()
      .collection('contracts')
      .select('id', 'uniqueBettorIds') as Query<
      Pick<Contract, 'id' | 'uniqueBettorIds'>
    >
  )
  const betPairs = filterDefined(
    contractUniqueBettorIds.map(({ id: contractId, uniqueBettorIds }) =>
      uniqueBettorIds?.map((userId) => ({
        userId,
        contractId,
      }))
    )
  ).flat()
  const betsByUser = mapValues(
    groupBy(betPairs, (pair) => pair.userId),
    (pairs) => pairs.map((pair) => pair.contractId)
  )
  console.log('Loaded bets')

  return await asyncMap(users, async (user) => {
    console.log(user.id)
    const userId = user.id
    const betOnIds = betsByUser[userId]
    const swipedIds = await loadPaginated(
      admin
        .firestore()
        .collection('users')
        .doc(user.id)
        .collection('seenMarkets')
        .select('id') as Query<{ id: string }>
    )
    const uniqueSwipeIds = uniq(swipedIds.map(({ id }) => id))

    const contractCardIds = await loadPaginated(
      firestore
        .collection('users')
        .doc(userId)
        .collection('events')
        .where('name', '==', 'view market card')
        .select('contractId') as Query<{ contractId: string }>
    )
    const uniqueContractCardIds = uniq(
      contractCardIds.map(({ contractId }) => contractId)
    )

    const contractPageIds = await loadPaginated(
      firestore
        .collection('users')
        .doc(userId)
        .collection('events')
        .where('name', '==', 'view market')
        .select('contractId') as Query<{ contractId: string }>
    )
    const uniqueContractPageIds = uniq(
      contractPageIds.map(({ contractId }) => contractId)
    )

    const likedIds = await loadPaginated(
      admin
        .firestore()
        .collection('users')
        .doc(userId)
        .collection('reactions')
        .where('contentType', '==', 'contract')
        .select('contentId') as Query<{ contentId: string }>
    )
    const uniqueLikedIds = uniq(likedIds.map(({ contentId }) => contentId))

    return {
      userId,
      betOnIds,
      swipedIds: uniqueSwipeIds,
      viewedCardIds: uniqueContractCardIds,
      viewedPageIds: uniqueContractPageIds,
      likedIds: uniqueLikedIds,
    }
  })
}

const recommend = async () => {
  console.log('Recommend script')

  let userData = await readJson<user_data[]>('user-data.json')

  if (userData) {
    console.log('Loaded view data from file.')
  } else {
    console.log('Loading view data from Firestore...')
    userData = await loadUserData()
    await writeJson('user-data.json', userData)
  }

  console.log('Computing recommendations...')
  const getUserContractScores = await getMarketRecommendations(userData)

  const jamesScores = getUserContractScores('5LZ4LgYuySdL1huCWe7bti02ghx2')
  const sortedScores = sortBy(
    Object.entries(jamesScores),
    ([, score]) => -score
  )
  console.log('top scores', sortedScores.slice(0, 20))
  console.log('bottom scores', sortedScores.slice(sortedScores.length - 20))

  console.log(
    'top scores',
    (
      await Promise.all(
        sortedScores.slice(0, 20).map(([contractId]) => getContract(contractId))
      )
    ).map((c) => c?.question)
  )
  console.log(
    'bottom scores',
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
